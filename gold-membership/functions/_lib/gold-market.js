import {getArchivedGold,storeGoldCandles,mergeGoldCandles} from './gold-archive.js';
// Real 15-minute gold candles for the website and scheduled notifications.
// Multiple independent market providers prevent one blocked or throttled endpoint
// from leaving the public workspace stuck on "Loading".
const BAR_MS=15*60*1000,DAY_MS=86400000,BROKER_OFFSET=3*3600000;
const RANGE_START=0,RANGE_END=7,SESSION_CLOSE=20,STOP_PCT=.01,SPREAD_USD=.30;
const asPrice=n=>Number.isFinite(Number(n))&&Number(n)>0?Number(n):NaN;
function validBar(b){
 return Number.isSafeInteger(b.time)&&Number.isFinite(b.open)&&Number.isFinite(b.close)&&
  Number.isFinite(b.high)&&Number.isFinite(b.low)&&b.open>0&&b.close>0&&
  b.high>=Math.max(b.open,b.close,b.low)&&b.low<=Math.min(b.open,b.close,b.high);
}
export function yahooBars(json){
 const item=json?.chart?.result?.[0],q=item?.indicators?.quote?.[0];
 if(!item||!q||!Array.isArray(item.timestamp))throw Error('Yahoo response is missing candle data.');
 return item.timestamp.map((time,i)=>({
  time:Number(time)*1000,open:asPrice(q.open?.[i]),high:asPrice(q.high?.[i]),
  low:asPrice(q.low?.[i]),close:asPrice(q.close?.[i])
 })).filter(validBar);
}
export function biquoteBars(json){
 if(!Array.isArray(json?.bars))throw Error('The fallback feed is missing candles.');
 return json.bars.filter(b=>!b.isOpen).map(b=>({
  time:Date.parse(b.openTime),open:asPrice(b.open),high:asPrice(b.high),
  low:asPrice(b.low),close:asPrice(b.close)
 })).filter(validBar);
}
function cleanFeed(raw,source,symbol,days,now=Date.now()){
 const sorted=raw.filter(b=>b.time>=now-(days+1)*DAY_MS&&b.time+BAR_MS<=now-20000)
  .sort((a,b)=>a.time-b.time);
 const bars=[];
 for(const b of sorted){
  if(bars.at(-1)?.time===b.time)bars[bars.length-1]=b;
  else bars.push(b);
 }
 if(bars.length<56)throw Error(source+' returned too few confirmed candles.');
 const latest=bars.at(-1);
 if(now-(latest.time+BAR_MS)>72*3600000)throw Error(source+' has not updated recently.');
 const availableDays=(latest.time-bars[0].time+BAR_MS)/DAY_MS;
 return {bars,source,symbol,asOf:new Date(latest.time+BAR_MS).toISOString(),
  interval:'15m',availableDays:Math.round(availableDays*10)/10,
  limitedHistory:availableDays<days-3};
}
async function getJson(url,timeoutMs=6500){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const res=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal});
  if(!res.ok)throw Error('Upstream HTTP '+res.status);
  return await res.json();
 }finally{clearTimeout(timer)}
}
async function yahooFeed(host,days,now,{proxy=false}={}){
 const params='?interval=15m&range='+(days===60?'2mo':'1mo')+'&includePrePost=false';
 const direct='https://'+host+'/v8/finance/chart/GC%3DF'+params;
 const url=proxy?'https://proxy.cors.dev/'+direct:direct;
 const json=await getJson(url,proxy?8500:6500);
 return cleanFeed(yahooBars(json),'COMEX gold futures · Yahoo Finance','GC=F',days,now);
}
async function biquoteFeed(days,now){
 // This feed only retains the latest 192 M15 bars. Never describe that as
 // 30 days. As visitors return, merge real candles into D1 archive.
 const json=await getJson('https://biquote.io/api/XAUUSD/ohlc?interval=15m&limit=192',7000);
 return cleanFeed(biquoteBars(json),'Gold spot · biquote','XAUUSD',days,now);
}
const cache=new Map(),inflight=new Map();
async function enrichWithArchive(db,feed,days,now){
 if(!db||!feed)return feed;
 try{
  const saved=await getArchivedGold(db,feed.symbol,days);
  if(!saved.length)return feed;
  const merged=mergeGoldCandles(feed.bars,saved);
  return {...cleanFeed(merged,feed.source,feed.symbol,days,now),stale:!!feed.stale};
 }catch(error){console.error('Gold candle archive read failed',error);return feed}
}
function keepGoldHistory(db,waitUntil,feed){
 if(!db||!feed)return;
 const job=storeGoldCandles(db,feed).catch(e=>console.error('Gold archive write failed',e));
 if(typeof waitUntil==='function')waitUntil(job);
 // Without a request lifetime hook, await is handled by the caller instead.
 return job;
}
export async function fetchGoldCandles(days=30,{db=null,waitUntil=null}={}){
 if(![30,60].includes(days))throw Error('Invalid backtest period.');
 const now=Date.now(),previous=cache.get(days);
 if(previous&&now-previous.loaded<75000)return previous.result;
 if(inflight.has(days))return inflight.get(days);
 const promise=(async()=>{
  let feed=null;
  // Two Yahoo servers and an independent fetch proxy request the same actual
  // GC=F 15m candles. The proxy recovers month-long history when Yahoo blocks
  // Cloudflare's outbound addresses. Choose full coverage before short data.
  const probes=[
   yahooFeed('query1.finance.yahoo.com',days,now),
   yahooFeed('query2.finance.yahoo.com',days,now),
   yahooFeed('query1.finance.yahoo.com',days,now,{proxy:true})
  ];
  const qualified=probes.map(p=>p.then(value=>{
   if(value.availableDays<days-4)throw Error('Gold feed has only '+value.availableDays+' days');
   return value;
  }));
  try{feed=await Promise.any(qualified)}
  catch{
   const settled=await Promise.allSettled(probes);
   const partial=settled.filter(r=>r.status==='fulfilled').map(r=>r.value);
   partial.sort((a,b)=>b.availableDays-a.availableDays);
   feed=partial[0]||null;
  }
  if(feed){
   feed=await enrichWithArchive(db,feed,days,now);
  }else{
   // Prefer archived month-long bars over a 192-candle backup if still fresh.
   try{
    if(db){
     const archived=await getArchivedGold(db,'GC=F',days);
     if(archived.length)feed={...cleanFeed(archived,
      'COMEX gold futures · retained history','GC=F',days,now),stale:true};
    }
   }catch(error){console.error('Gold futures archive unavailable',error)}
   if(!feed){
    try{
     feed=await biquoteFeed(days,now);
     feed=await enrichWithArchive(db,feed,days,now);
    }catch(error){
     console.error('Gold short-term fallback unavailable',error);
    }
   }
  }
  if(!feed){
   if(previous&&now-previous.loaded<15*60000)return {...previous.result,stale:true};
   throw Error('No current Gold 15-minute market data is available.');
  }
  // Persist genuine confirmed 15m bars by instrument, never fabricate older
  // candles and never mix COMEX futures with spot XAUUSD.
  const job=keepGoldHistory(db,waitUntil,feed);
  if(job&&typeof waitUntil!=='function')await job;
  cache.set(days,{loaded:Date.now(),result:feed});
  return feed;
 })();
 inflight.set(days,promise);
 try{return await promise}finally{inflight.delete(days)}
}
const brokerDate=ms=>new Date(ms+BROKER_OFFSET).toISOString().slice(0,10);
const brokerHour=ms=>new Date(ms+BROKER_OFFSET).getUTCHours();
const round=n=>Math.round(n*100)/100;
const event=(type,t,price,reason,side,tradeId)=>({id:'gold-15m:'+tradeId+':'+type,time:t,type,price:round(price),side,reason});
export function runGoldBreakout(input,{days=30}={}){
 if(!Array.isArray(input)||!input.length)throw Error('No historical candles');
 const bars=input.filter(validBar).sort((a,b)=>a.time-b.time);
 const cutoff=bars.at(-1).time-days*DAY_MS;
 const traded=[],events=[],rangeLines=[];
 let date='',hi=-Infinity,lo=Infinity,rangeCount=0,position=null,completed=false;
 let dayStart=null,rangeFirstHour=null,rangeLastHour=null,rangeFinalized=false,rangeReady=false;
 // Gold futures can have a one-hour maintenance break at the beginning of
 // the broker day. Require >=20 observed 15m bars (of 28 scheduled bars)
 // spanning the overnight range, rather than requiring all 28 candles.
 const exit=(at,price,reason)=>{
  if(!position)return;
  const pnl=(price-position.entry)*(position.side==='LONG'?1:-1)-SPREAD_USD;
  const rr=pnl/Math.abs(position.entry-position.stop);
  const trade={id:position.id,side:position.side,entryTime:position.time,entry:round(position.entry),
   stop:round(position.stop),exitTime:at,exit:round(price),reason,pnl:round(pnl),r:Math.round(rr*1000)/1000};
  traded.push(trade);events.push(event('EXIT',at,price,reason,position.side,position.id));
  position=null;completed=true;
 };
 for(let i=0;i<bars.length;i++){
  const bar=bars[i],d=brokerDate(bar.time),h=brokerHour(bar.time);
  if(d!==date){
   if(position)exit(bar.time,bar.open,'Session close');
   date=d;hi=-Infinity;lo=Infinity;rangeCount=0;completed=false;
   dayStart=bar.time;rangeFirstHour=null;rangeLastHour=null;
   rangeFinalized=false;rangeReady=false;
  }
  if(h>=RANGE_START&&h<RANGE_END&&!rangeFinalized){
   hi=Math.max(hi,bar.high);lo=Math.min(lo,bar.low);rangeCount++;
   if(rangeFirstHour===null)rangeFirstHour=h;
   rangeLastHour=h;
  }
  // Freeze the range at the opening of the trading window, never later.
  // CME/COMEX futures commonly omit 00:00-00:45 on the broker UTC+3 clock,
  // while spot gold may trade all 28 candles. Both are valid real sessions.
  if(!rangeFinalized&&h>=RANGE_END){
   rangeFinalized=true;
   rangeReady=rangeCount>=20&&rangeFirstHour!==null&&
    rangeFirstHour<=2&&rangeLastHour>=6&&Number.isFinite(hi)&&hi>lo;
   if(rangeReady){
    rangeLines.push({day:d,high:round(hi),low:round(lo),
     start:dayStart,end:bar.time,observedBars:rangeCount});
   }
  }
  const ready=rangeFinalized&&rangeReady;
  if(position){
   if(h>=SESSION_CLOSE){exit(bar.time,bar.open,'Session close');continue}
   if(position.side==='LONG'&&bar.low<=position.stop)
    exit(bar.time,Math.min(bar.open,position.stop),'Stop-loss');
   else if(position.side==='SHORT'&&bar.high>=position.stop)
    exit(bar.time,Math.max(bar.open,position.stop),'Stop-loss');
  }
  if(!position&&!completed&&ready&&h>=RANGE_END&&h<SESSION_CLOSE){
   const up=bar.high>=hi,down=bar.low<=lo;
   // If both sides break within one candle the order of fills is unknowable.
   if(up&&down){completed=true;continue}
   if(up||down){
    const side=up?'LONG':'SHORT';
    const price=up?Math.max(bar.open,hi):Math.min(bar.open,lo);
    const stop=side==='LONG'?price*(1-STOP_PCT):price*(1+STOP_PCT);
    const id=d+'-'+side;
    position={side,entry:price,stop,time:bar.time,id};
    events.push({...event('ENTRY',bar.time,price,'Range breakout',side,id),stop:round(stop)});
    // On an entry candle, a stop hit is conservatively counted as a loss.
    if(side==='LONG'&&bar.low<=stop)exit(bar.time,Math.min(bar.open,stop),'Stop-loss');
    else if(side==='SHORT'&&bar.high>=stop)exit(bar.time,Math.max(bar.open,stop),'Stop-loss');
   }
  }
 }
 // Never invent an exit for a trade that is still open.
 const visibleTrades=traded.filter(t=>t.entryTime>=cutoff);
 const visibleEvents=events.filter(t=>t.time>=cutoff);
 const wins=visibleTrades.filter(t=>t.r>0),grossWin=wins.reduce((n,t)=>n+t.r,0);
 const losses=visibleTrades.filter(t=>t.r<0),grossLoss=Math.abs(losses.reduce((n,t)=>n+t.r,0));
 let equity=0,peak=0,maxDrawdown=0;
 for(const t of visibleTrades){equity+=t.r;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity)}
 const lastRange=rangeLines.at(-1),status=position?position.side+' open':!lastRange?'Building range':'Waiting for next setup';
 return {
  candles:bars.filter(b=>b.time>=cutoff).slice(-6000),
  ranges:rangeLines.filter(r=>r.end>=cutoff).slice(-80),
  events:visibleEvents.slice(-250),trades:visibleTrades.slice(-150).reverse(),
  stats:{trades:visibleTrades.length,wins:wins.length,winRate:visibleTrades.length?
   round(wins.length/visibleTrades.length*100):0,profitFactor:grossLoss?round(grossWin/grossLoss):null,
   netR:round(equity),maxDrawdownR:round(maxDrawdown)},
  current:{status,position:position?{side:position.side,entry:round(position.entry),
   stop:round(position.stop),openedAt:position.time}:null,range:lastRange||null,
   lastEvent:visibleEvents.at(-1)||null},
  settings:{timeframe:'15m',brokerClock:'UTC+03:00',range:'00:00–07:00',
   tradeWindow:'07:00–20:00',stop:'1% from entry',roundTripSpreadUsd:SPREAD_USD},
  coverage:{from:new Date(bars[0].time).toISOString(),to:new Date(bars.at(-1).time+BAR_MS).toISOString(),
   candles:bars.length,requestedDays:days}
 };
}
