// Server-only gold trial engine. Strategy source and parameters never enter browser bundles.
// One coherent 15m gold-futures feed for chart, backtest and dispatched alerts.
const BAR_MS=15*60*1000, DAY_MS=86400000, BROKER_OFFSET=3*3600000;
const RANGE_START=0,RANGE_END=7,SESSION_CLOSE=20,STOP_PCT=.01,SPREAD_USD=.30;
const asPrice=n=>Number.isFinite(Number(n))&&Number(n)>0?Number(n):NaN;
function validBar(b){
 return Number.isSafeInteger(b.time)&&Number.isFinite(b.open)&&Number.isFinite(b.close)&&
  Number.isFinite(b.high)&&Number.isFinite(b.low)&&b.open>0&&b.close>0&&
  b.high>=Math.max(b.open,b.close,b.low)&&b.low<=Math.min(b.open,b.close,b.high);
}
function yahooBars(json){
 const item=json?.chart?.result?.[0],q=item?.indicators?.quote?.[0];
 if(!item||!q||!Array.isArray(item.timestamp))throw Error('Market data response was incomplete.');
 return item.timestamp.map((time,i)=>({
  time:Number(time)*1000,open:asPrice(q.open?.[i]),high:asPrice(q.high?.[i]),
  low:asPrice(q.low?.[i]),close:asPrice(q.close?.[i])
 })).filter(validBar);
}
let cached={};
export async function fetchGoldCandles(days=30){
 if(![30,60].includes(days))throw Error('Invalid backtest period.');
 const entry=cached[days],now=Date.now();
 if(entry&&now-entry.loaded<45000)return entry.result;
 const url='https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=15m&period1='+
  Math.floor((now-(days===60?59.5:days+1)*DAY_MS)/1000)+'&period2='+Math.floor((now+DAY_MS)/1000);
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10500);
 let response;
 try{response=await fetch(url,{headers:{'Accept':'application/json','User-Agent':'Mozilla/5.0 (compatible; SignalToScriptMarket/1.0)'},
   signal:controller.signal});}
 finally{clearTimeout(timeout)}
 if(!response.ok)throw Error('Market feed returned '+response.status);
 const bars=yahooBars(await response.json())
  .filter(b=>b.time>=now-(days+1)*DAY_MS&&b.time<=now+BAR_MS)
  .sort((a,b)=>a.time-b.time);
 const unique=[];for(const b of bars){if(unique.at(-1)?.time===b.time)unique[unique.length-1]=b;else unique.push(b)}
 const closed=unique.filter(b=>b.time+BAR_MS<=now-20000);
 if(closed.length<70)throw Error('Not enough recent gold candles to calculate the strategy.');
 const latest=closed.at(-1);
 if(now-(latest.time+BAR_MS)>72*3600000)throw Error('Gold candle feed is not current.');
 const result={bars:closed,source:'COMEX gold futures · Yahoo Finance',symbol:'GC=F',
  asOf:new Date(latest.time+BAR_MS).toISOString(),interval:'15m'};
 cached[days]={loaded:now,result};return result;
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
 let dayStart=null,chartRange=null,everBuilt=false;
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
   // A complete overnight range is required; never trade on a partial first day.
   dayStart=bar.time;everBuilt=false;
  }
  if(h>=RANGE_START&&h<RANGE_END){
   hi=Math.max(hi,bar.high);lo=Math.min(lo,bar.low);rangeCount++;
   if(rangeCount>=RANGE_END*4)everBuilt=true;
  }
  const ready=everBuilt&&Number.isFinite(hi)&&hi>lo;
  if(ready&&h===RANGE_END&&rangeCount===RANGE_END*4){
   chartRange={day:d,high:round(hi),low:round(lo),start:dayStart,end:bar.time};
   rangeLines.push(chartRange);
  }
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
    events.push(event('ENTRY',bar.time,price,'Range breakout',side,id));
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
