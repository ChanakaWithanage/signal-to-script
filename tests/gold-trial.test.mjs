import test from 'node:test';
import assert from 'node:assert/strict';
import {runGoldBreakout,fetchGoldCandles,biquoteBars} from '../functions/_lib/gold-market.js';
import {storeGoldCandles,getArchivedGold,mergeGoldCandles} from '../functions/_lib/gold-archive.js';
import {illustrativeGoldResults,goldTradeUsd,EXAMPLE_CAPITAL_USD,EXAMPLE_RISK_PERCENT} from '../functions/_lib/gold-performance.js';
import {validEmail,normalizeEmail,discordUrl,TRIAL_DAYS,UPGRADE_AFTER_MS,upgradeEligible,claimUpgradePrompt,instantSubscribe,signedIn} from '../functions/_lib/gold-trial.js';
import {onRequestPost as startTrial} from '../functions/api/trial/start.js';
import {onRequestGet as listSubscribers} from '../functions/api/trial/subscribers.js';
import {onRequestGet as goldData} from '../functions/api/trial/data.js';
function dayBars(date,side='LONG',ambiguous=false){
 const start=Date.parse(date+'T21:00:00Z');
 const bars=[];
 for(let index=0;index<96;index++){
  let open=105,high=110,low=100,close=105;
  if(index>=28&&index<80){open=105;high=109;low=102;close=106}
  if(index===28){
   if(ambiguous){open=105;high=112;low=98;close=107}
   else if(side==='LONG'){open=109.4;high=112;low=109.3;close=111}
   else{open=100.6;high=101;low=98;close=99}
  }
  if(index>28&&index<80){
   if(side==='LONG'){open=112;high=115;low=111;close=114}
   else{open=97;high=99;low=94;close=95}
  }
  if(index>=80){open=side==='LONG'?115:94;high=open+1;low=open-1;close=open}
  bars.push({time:start+index*900000,open,high,low,close});
 }
 return bars;
}
test('Gold 15M runs one complete breakout and time exit from a complete overnight range',()=>{
 const result=runGoldBreakout(dayBars('2026-11-18'),{days:30});
 assert.equal(result.stats.trades,1);
 assert.equal(result.stats.wins,1);
 assert.equal(result.trades[0].side,'LONG');
 assert.equal(result.trades[0].reason,'Session close');
 assert.equal(result.events[0].type,'ENTRY');
 assert.equal(result.events.at(-1).type,'EXIT');
 assert.equal(result.ranges.length,1);
 assert.equal(result.ranges[0].high,110);
});
test('A short breakout has a negative-direction entry signal and a closed trade',()=>{
 const result=runGoldBreakout(dayBars('2026-11-18','SHORT'),{days:30});
 assert.equal(result.trades.length,1);
 assert.equal(result.trades[0].side,'SHORT');
 assert.equal(result.events[0].side,'SHORT');
});
test('Ambiguous same-bar breaks do not fabricate entry order',()=>{
 const result=runGoldBreakout(dayBars('2026-11-18','LONG',true),{days:30});
 assert.equal(result.trades.length,0);
 assert.equal(result.events.length,0);
});
test('Trial email normalization, Discord hook checks and duration',()=>{
 assert.equal(TRIAL_DAYS,7);
 assert.equal(normalizeEmail('  TEST@EXAMPLE.COM  '),'test@example.com');
 assert.equal(validEmail('test@example.com'),true);
 assert.equal(validEmail('not-email'),false);
 assert.equal(discordUrl('https://discord.com/api/webhooks/123456789012345678/abcdefghijABCDEFGHIJ'),true);
 assert.equal(discordUrl('https://other.example/api/webhooks/123456789012345678/abcdefghijABCDEFGHIJ'),false);
});

test('Lifetime offer starts after day five, not during the initial signup',()=>{
 const started=Date.parse('2026-11-01T00:00:00Z');
 const account={email:'gold@example.com',createdAt:started,expiresAt:started+7*86400000,lifetime:false};
 assert.equal(UPGRADE_AFTER_MS,5*86400000);
 assert.equal(upgradeEligible(account,started),false);
 assert.equal(upgradeEligible(account,started+4*86400000+86399999),false);
 assert.equal(upgradeEligible(account,started+5*86400000),true);
 assert.equal(upgradeEligible(account,started+7*86400000),true);
 assert.equal(upgradeEligible({...account,lifetime:true},started+6*86400000),false);
});
test('Membership prompt is limited to once per account every 24 hours',async()=>{
 const first=Date.parse('2026-11-07T00:00:00Z');
 const account={email:'gold2@example.com',createdAt:first-6*86400000,lifetime:false};
 const last=new Map();
 const db={prepare(sql){
  let args=[];
  return {bind(...values){args=values;return this},async run(){
   if(!sql.includes('INSERT INTO gold_trial_offer_prompts'))return {meta:{changes:0}};
   const [email,now,limit]=args;
   if(last.has(email)&&last.get(email)>limit)return {meta:{changes:0}};
   last.set(email,now);return {meta:{changes:1}};
  }};
 }};
 assert.equal(await claimUpgradePrompt(db,account,first),true);
 assert.equal(await claimUpgradePrompt(db,account,first+1000),false);
 assert.equal(await claimUpgradePrompt(db,account,first+24*3600000),true);
 assert.equal(await claimUpgradePrompt(db,{...account,lifetime:true},first+48*3600000),false);
});
test('Gold candle adapter falls back to actual XAUUSD 15m bars if Yahoo is unavailable',async()=>{
 const oldFetch=globalThis.fetch;
 const end=Math.floor((Date.now()-20*60000)/900000)*900000;
 const bars=Array.from({length:160},(_,index)=>{
  const at=new Date(end-(159-index)*900000).toISOString();
  return {openTime:at,open:4050,high:4053,low:4048,close:4051,isOpen:false};
 });
 try{
  globalThis.fetch=async url=>String(url).includes('finance.yahoo.com')?
   {ok:false,status:429}:{ok:true,json:async()=>({bars,symbol:'XAUUSD',interval:'15m'})};
  const result=await fetchGoldCandles(30);
  assert.equal(result.symbol,'XAUUSD');
  assert.match(result.source,/biquote/);
  assert.equal(result.bars.length,160);
  assert.equal(result.limitedHistory,true);
  assert.equal(result.interval,'15m');
 }finally{globalThis.fetch=oldFetch}
});
test('Fallback candle parser excludes a still-open bar and rejects malformed OHLC',()=>{
 const now=new Date().toISOString();
 assert.equal(biquoteBars({bars:[
  {openTime:now,open:4000,high:4001,low:3999,close:4000,isOpen:true},
  {openTime:now,open:4000,high:4001,low:3999,close:4000,isOpen:false},
  {openTime:now,open:-3,high:4001,low:3999,close:4000,isOpen:false}
 ]}).length,1);
});
test('Unproven email-only session never inherits an existing paid membership',async()=>{
 const token='a'.repeat(64);
 const request=new Request('https://signaltoscript.com/api/trial/session',{headers:{Cookie:'__Host-sts_trial='+token}});
 const db={prepare(sql){return {bind(){return this},async first(){
  if(sql.includes('LEFT JOIN gold_trial_instant_sessions'))return {
   email:'paid@example.com',created_ms:Date.now()-86400000,expires_ms:Date.now()+86400000,
   lifetime:1,instant_token:'digest',session_proven:0};
  return null;
 }}}};
 const result=await signedIn(db,request);
 assert.equal(result.lifetime,false);
 assert.equal(result.active,true);
});
test('Subscriber list is never accessible without the owner admin key',async()=>{
 const request=new Request('https://signaltoscript.com/api/trial/subscribers');
 const response=await listSubscribers({request,env:{DB:{},TRIAL_ADMIN_KEY:'x'.repeat(48)}});
 assert.equal(response.status,404);
});
test('COMEX 15m maintenance gap does not suppress a valid overnight breakout',()=>{
 const complete=dayBars('2026-11-18');
 // CME futures can omit the first broker-clock hour (4 real 15m bars).
 const maintenanceGap=complete.slice(4);
 const result=runGoldBreakout(maintenanceGap,{days:30});
 assert.equal(result.settings.timeframe,'15m');
 assert.equal(result.stats.trades,1);
 assert.equal(result.events.length,2);
 assert.deepEqual(result.events.map(e=>e.type),['ENTRY','EXIT']);
 assert.equal(result.events[0].side,'LONG');
 assert.equal(result.ranges[0].observedBars,24);
 assert.equal(result.ranges[0].high,110);
 assert.equal(result.ranges[0].low,100);
 assert.equal(result.events[0].time,complete[28].time);
});
test('Incomplete midday-only data never invents a valid overnight 15m range',()=>{
 const partial=dayBars('2026-11-18').slice(16);
 const result=runGoldBreakout(partial,{days:30});
 assert.equal(result.stats.trades,0);
 assert.equal(result.events.length,0);
 assert.equal(result.ranges.length,0);
});
test('Thirty-day strategy data is restored from a full Yahoo proxy even if direct Yahoo is blocked',async()=>{
 // Use the unused 60d cache lane so this test is independent of earlier
 // cached 30d biquote fixture.
 const original=globalThis.fetch;
 const interval=15*60000;
 const newest=Math.floor((Date.now()-1800000)/interval)*interval;
 const length=58*96;
 const timestamps=Array.from({length},(_,i)=>(newest-(length-i-1)*interval)/1000);
 const quote={open:Array(length).fill(4000),high:Array(length).fill(4010),
  low:Array(length).fill(3990),close:Array(length).fill(4004)};
 const yahoo={chart:{result:[{timestamp:timestamps,indicators:{quote:[quote]}}]}};
 const called=[];
 try{
  globalThis.fetch=async url=>{
   called.push(String(url));
   if(String(url).startsWith('https://proxy.cors.dev/'))
    return {ok:true,json:async()=>yahoo};
   return {ok:false,status:429};
  };
  const feed=await fetchGoldCandles(60);
  assert.equal(feed.symbol,'GC=F');
  assert.ok(feed.availableDays>=56);
  assert.ok(feed.bars.length>5000);
  assert.equal(feed.limitedHistory,false);
  assert.ok(called.some(url=>url.includes('proxy.cors.dev')));
  assert.equal(feed.interval,'15m');
 }finally{globalThis.fetch=original}
});
test('D1 retention merges real candles chronologically and deduplicates overlaps',async()=>{
 const memory=new Map();
 const db={prepare(sql){
  let args=[];
  return {
   bind(...values){args=values;return this},
   async run(){
    if(sql.includes('INSERT OR IGNORE INTO gold_candle_history')){
     for(let i=0;i<args.length;i+=7){
      const row=args.slice(i,i+7),key=row[0]+':'+row[1];
      if(!memory.has(key))memory.set(key,{symbol:row[0],time_ms:row[1],
       open:row[2],high:row[3],low:row[4],close:row[5],source:row[6]});
     }
    }
    return {meta:{changes:1}};
   },
   async first(){
    if(sql.includes('MAX(time_ms)')){
     const times=[...memory.values()].filter(row=>row.symbol===args[0]).map(row=>row.time_ms);
     return {latest:times.length?Math.max(...times):null};
    }
    return null;
   },
   async all(){
    if(sql.includes('FROM gold_candle_history')){
     return {results:[...memory.values()].filter(row=>row.symbol===args[0]&&row.time_ms>=args[1])
      .sort((a,b)=>a.time_ms-b.time_ms)};
    }
    return {results:[]};
   }
  };
 }};
 const end=Math.floor((Date.now()-1800000)/900000)*900000;
 const bars=Array.from({length:75},(_,i)=>({time:end-(74-i)*900000,
  open:4000+i,high:4003+i,low:3998+i,close:4001+i}));
 await storeGoldCandles(db,{symbol:'GC=F',source:'Yahoo Finance',bars});
 await storeGoldCandles(db,{symbol:'GC=F',source:'Yahoo Finance',bars});
 assert.equal(memory.size,75);
 const saved=await getArchivedGold(db,'GC=F',30);
 assert.equal(saved.length,75);
 assert.deepEqual(saved.map(b=>b.time),bars.map(b=>b.time));
 assert.deepEqual(mergeGoldCandles(bars.slice(-5),saved),saved);
 assert.equal((await getArchivedGold(db,'XAUUSD',30)).length,0);
});
test('Illustrative $100k performance is calculated from backtest R not fabricated returns',()=>{
 assert.equal(EXAMPLE_CAPITAL_USD,100000);
 assert.equal(EXAMPLE_RISK_PERCENT,1);
 const win=illustrativeGoldResults({netR:3.25,maxDrawdownR:1.75});
 assert.equal(win.capitalUsd,100000);
 assert.equal(win.riskPercent,1);
 assert.equal(win.riskUsd,1000);
 assert.equal(win.netUsd,3250);
 assert.equal(win.returnPercent,3.25);
 assert.equal(win.maxDrawdownUsd,1750);
 assert.match(win.method,/no compounding/);
 const loss=illustrativeGoldResults({netR:-2.7,maxDrawdownR:4.2});
 assert.equal(loss.netUsd,-2700);
 assert.equal(loss.returnPercent,-2.7);
 assert.equal(loss.maxDrawdownUsd,4200);
 assert.equal(illustrativeGoldResults(null),null);
});
test('Every $100,000-based trade result uses the same risk unit as the summary',()=>{
 assert.equal(goldTradeUsd(1),1000);
 assert.equal(goldTradeUsd(-.75),-750);
 assert.equal(goldTradeUsd(0),0);
 assert.equal(goldTradeUsd(1.234),1234);
 assert.equal(goldTradeUsd(-1.111),-1111);
 assert.equal(goldTradeUsd(NaN),null);
 const summary=illustrativeGoldResults({netR:2.4,maxDrawdownR:1.25});
 assert.equal(summary.netUsd,2400);
 assert.equal(summary.returnPercent,2.4);
 assert.equal(summary.maxDrawdownUsd,1250);
});


test('Legacy main-domain Gold trial routes permanently redirect to Gold Signal Room',async()=>{
 const {readFile}=await import('node:fs/promises');
 const redirects=await readFile(new URL('../public/_redirects',import.meta.url),'utf8');
 const html=await readFile(new URL('../public/trial.html',import.meta.url),'utf8');
 const home=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const article=await readFile(new URL('../public/articles/gold-breakout-15m-strategy.html',import.meta.url),'utf8');
 assert.match(redirects,/\/trial\.html https:\/\/gold\.signaltoscript\.com\/ 301/);
 assert.match(html,/http-equiv="refresh"/);
 assert.doesNotMatch(html,/id="trial-workspace"/);
 assert.match(home,/37\.5% OFF/);
 assert.match(home,/https:\/\/gold\.signaltoscript\.com\//);
 assert.doesNotMatch(home,/Get Gold Breakout alerts for free/);
 assert.match(article,/https:\/\/gold\.signaltoscript\.com\/pricing\.html/);
});
test('Retired main-domain Gold API no longer leaks real-time signals or creates free accounts',async()=>{
 const guest=new Request('https://signaltoscript.com/api/trial/data?days=30');
 const dataRes=await goldData({request:guest,env:{}});
 assert.equal(dataRes.status,410);
 const body=await dataRes.json();
 assert.equal(body.code,'GOLD_ROOM_MOVED');
 assert.equal('candles' in body,false);
 const signup=await startTrial({request:new Request('https://signaltoscript.com/api/trial/start',{
  method:'POST',headers:{Origin:'https://signaltoscript.com','Content-Type':'application/json'},
  body:JSON.stringify({email:'old@example.com'})}),env:{}});
 assert.equal(signup.status,410);
 assert.equal((await signup.json()).code,'GOLD_ROOM_MOVED');
});
