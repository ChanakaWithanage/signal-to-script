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
test('Gold alert marketing opens the workspace before collecting email',async()=>{
 const {readFile}=await import('node:fs/promises');
 const home=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const page=await readFile(new URL('../public/trial.html',import.meta.url),'utf8');
 const article=await readFile(new URL('../public/articles/gold-breakout-15m-strategy.html',import.meta.url),'utf8');
 assert.match(home,/Get Gold Breakout alerts for free/);
 assert.doesNotMatch(home,/Try it before you buy|7 days free|Email only/i);
 assert.match(page,/<section class="trial-workspace" id="trial-workspace">/);
 assert.match(page,/<dialog class="trial-access-dialog"/);
 assert.match(page,/Enter your email and start for free/);
 assert.match(page,/<dialog class="trial-upgrade-dialog"/);
 assert.doesNotMatch(article,/\$4\.99|before buying/);
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
test('Email submission activates a browser trial immediately and stores lead metadata',async()=>{
 const statements=[];
 const db={prepare(sql){
  const stmt={values:[],bind(...values){this.values=values;return this},
   async run(){statements.push({sql,values:this.values});return {meta:{changes:1}}},
   async first(){return null}};
  return stmt;
 }};
 const request=new Request('https://signaltoscript.com/api/trial/start',{
  method:'POST',headers:{Origin:'https://signaltoscript.com','Content-Type':'application/json'},
  body:JSON.stringify({email:'  free@example.com  ',source:'gold-workspace',
   utmSource:'social',utmCampaign:'gold-alerts'})
 });
 const response=await startTrial({request,env:{DB:db}});
 const data=await response.json();
 assert.equal(response.status,200);
 assert.equal(data.ok,true);
 assert.equal(data.active,true);
 assert.match(response.headers.get('Set-Cookie'),/__Host-sts_trial=[a-f0-9]{64}/);
 assert.ok(statements.some(x=>x.sql.includes('INSERT INTO gold_trial_subscribers')&&x.values[0]==='free@example.com'));
 assert.ok(statements.some(x=>x.sql.includes('gold_trial_instant_sessions')));
 assert.ok(statements.some(x=>x.sql.includes('gold_trial_accounts')&&x.sql.includes('ON CONFLICT(email) DO NOTHING')));
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
test('Workspace presents instant signup and a real chart fallback',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../public/trial.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../public/trial.js',import.meta.url),'utf8');
 assert.match(html,/Start my 7-day free alerts/);
 assert.doesNotMatch(html,/Check your inbox|trial-email-sent|trial-try-another/);
 assert.match(js,/await post\('start',data\)/);
 assert.match(js,/await loadSession\(\{prompt:false\}\)/);
 assert.match(js,/showMarketFallback/);
 assert.match(js,/s\.tradingview\.com\/widgetembed/);
});

test('Historical Gold signals and 30-day results can be seen without email signup',async()=>{
 // The real-data adapter is shared with the previous mocked fallback test.
 const guest=new Request('https://signaltoscript.com/api/trial/data?days=30');
 const response=await goldData({request:guest,env:{}});
 const result=await response.json();
 assert.equal(response.status,200);
 assert.equal(result.preview,false);
 assert.ok(Array.isArray(result.candles)&&result.candles.length>0);
 assert.ok(Array.isArray(result.trades));
 assert.ok(Array.isArray(result.events));
 assert.equal(typeof result.stats.trades,'number');
 assert.ok(result.market.source);
 assert.equal(result.trial.signedIn,false);
});
test('An anonymous viewer still cannot request extended lifetime backtests',async()=>{
 const request=new Request('https://signaltoscript.com/api/trial/data?days=60');
 const response=await goldData({request,env:{}});
 const result=await response.json();
 assert.equal(response.status,403);
 assert.equal(result.code,'UPGRADE_REQUIRED');
});
test('Gold workspace presents free BUY SELL CTA followed by chart and historical results',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../public/trial.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../public/trial.js',import.meta.url),'utf8');
 const article=await readFile(new URL('../public/articles/gold-breakout-15m-strategy.html',import.meta.url),'utf8');
 assert.match(html,/Get BUY &amp; SELL Alerts Free/);
 assert.match(html,/FROM PAST RESULTS TO FUTURE SIGNALS/);
 assert.match(html,/Get future entry &amp; exit alerts for free/);
 assert.match(html,/No verification step/);
 assert.match(js,/trial-activate'\)\.addEventListener\('click',openEmailDialog\)/);
 assert.match(js,/trial-results-invite-button'\)\.addEventListener\('click',openEmailDialog\)/);
 assert.match(js,/const canSubscribe=!session\?\.signedIn/);
 assert.doesNotMatch(js,/if\(!session\.signedIn&&prompt\)openEmailDialog\(\)/);
 assert.match(article,/Explore past Gold Breakout entries, exits and backtest results/);
 assert.doesNotMatch(html,/\$4\.99|before you buy/i);
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
test('15m Gold chart explicitly renders and navigates historical BUY SELL EXIT markers',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../public/trial.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../public/trial.js',import.meta.url),'utf8');
 assert.match(html,/Gold · 15-minute candles/);
 assert.doesNotMatch(html,/id="trial-show-last-signal"/);
 assert.doesNotMatch(html,/id="trial-show-latest-bars"/);
 assert.match(html,/id="trial-signal-history"/);
 assert.match(html,/id="trial-signal-count"/);
 assert.match(js,/function showSignalHistory/);
 assert.doesNotMatch(js,/function focusLatestSignal/);
 assert.doesNotMatch(js,/function focusLatestBars/);
 assert.match(js,/candles\.setMarkers\(markerData\)/);
 assert.match(js,/setVisibleLogicalRange/);
 assert.doesNotMatch(js,/chart\.timeScale\(\)\.fitContent\(\)/);
 assert.match(js,/item\.market\.interval!=='15m'/);
 assert.match(js,/15-minute price-only fallback/);
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
test('Chart exposes separate 7-day and 30-day windows and shows all loaded signals',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../public/trial.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../public/trial.js',import.meta.url),'utf8');
 const adapter=await readFile(new URL('../functions/_lib/gold-market.js',import.meta.url),'utf8');
 const endpoint=await readFile(new URL('../functions/api/trial/data.js',import.meta.url),'utf8');
 assert.match(html,/data-view-days="7" class="active"/);
 assert.match(html,/data-view-days="30"/);
 assert.match(html,/id="trial-history-coverage"/);
 assert.match(js,/chartHistoryWindow\(7\)/);
 assert.match(js,/chartHistoryWindow\(30\)/);
 assert.match(js,/reverse\(\)\.slice\(0,100\)/);
 assert.match(js,/trial-history-coverage/);
 assert.match(adapter,/proxy\.cors\.dev/);
 assert.match(adapter,/getArchivedGold/);
 assert.match(endpoint,/waitUntil:typeof waitUntil/);
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
test('Public trial response contains historical strategy results without a hypothetical account figure',async()=>{
 const request=new Request('https://signaltoscript.com/api/trial/data?days=30');
 const response=await goldData({request,env:{}});
 const result=await response.json();
 assert.equal(response.status,200);
 assert.equal(typeof result.stats.netR,'number');
 assert.equal(typeof result.stats.maxDrawdownR,'number');
 assert.equal(Object.hasOwn(result,'exampleAccount'),false);
 assert.equal(result.performanceUsd.capitalUsd,100000);
 assert.equal(result.performanceUsd.riskUsd,1000);
 assert.equal(result.performanceUsd.netUsd,Math.round(result.stats.netR*100000)/100);
 assert.equal(result.performanceUsd.maxDrawdownUsd,
  Math.round(result.stats.maxDrawdownR*100000)/100);
 for(const trade of result.trades){
  assert.equal(trade.resultUsd,goldTradeUsd(trade.r,1000));
 }
});
test('Workspace orders signup, 15m chart, performance and completed trade history',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../public/trial.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../public/trial.js',import.meta.url),'utf8');
 const css=await readFile(new URL('../public/trial.css',import.meta.url),'utf8');
 const signup=html.indexOf('id="trial-activate"');
 const chart=html.indexOf('id="trial-chart"');
 const performance=html.indexOf('id="trial-performance"');
 const status=html.indexOf('class="trial-status-card"');
 const alerts=html.indexOf('class="trial-alerts-card"');
 const trades=html.indexOf('id="trial-trade-history"');
 assert.ok(signup>=0&&signup<chart&&chart<performance&&performance<status);
 assert.ok(status<alerts&&alerts<trades);
 assert.match(html,/id="trial-metric-net"/);
 assert.match(html,/id="trial-metric-win"/);
 assert.match(html,/id="trial-metric-dd"/);
 assert.match(html,/\$100,000/);
 assert.match(html,/1% risk per trade/);
 assert.match(html,/id="trial-metric-return"/);
 assert.match(html,/Result \(USD\)/);
 assert.doesNotMatch(html,/No compounding|Illustrative net P|trial-performance-cta|example account/i);
 assert.doesNotMatch(html,/trial-metric-profit|trial-chart-invite|Combined trade results in R|Peak-to-trough in R/i);
 assert.doesNotMatch(js,/trial-metric-profit|example\.netUsd|trial-performance-cta/);
 assert.match(js,/fmtUSD\(performance\.netUsd,true\)/);
 assert.match(js,/fmtUSD\(performance\.maxDrawdownUsd\)/);
 assert.match(js,/fmtUSD\(item\.resultUsd,true\)/);
 assert.match(css,/trial-hero-alert-action/);
 assert.doesNotMatch(html,/trial-show-last-signal|trial-show-latest-bars/);
 assert.doesNotMatch(js,/trial-show-last-signal|trial-show-latest-bars/);
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

test('Clicking 60 days opens membership offer without changing public chart data',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../public/trial.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../public/trial.js',import.meta.url),'utf8');
 assert.match(html,/data-days="60"/);
 assert.match(html,/id="trial-upgrade-dialog"/);
 assert.match(html,/id="trial-upgrade-kicker"/);
 assert.match(html,/id="trial-upgrade-primary"/);
 assert.match(html,/checkout\.html\?script=gold-breakout-15m/);
 assert.match(js,/if\(next===60&&!session\?\.lifetime\)/);
 assert.match(js,/openUpgradeDialog\('history'\)/);
 assert.match(js,/Unlock 60 days of Gold Breakout results/);
 assert.match(js,/Unlock 60-day history with lifetime access/);
 assert.doesNotMatch(js,/message\('Extended backtesting is available with lifetime access/);
});

test('Gold-only engaged chart viewing prompts free trial after 45 visible seconds and limits repeats',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../public/trial.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../public/trial.js',import.meta.url),'utf8');
 assert.match(js,/GOLD_CHART_DWELL_SECONDS=45/);
 assert.match(js,/GOLD_SIGNUP_COOLDOWN_MS=24\*60\*60\*1000/);
 assert.match(js,/startGoldChartEngagementPrompt\(\)/);
 assert.match(js,/location\.pathname!=='\/trial\.html'/);
 assert.match(js,/new IntersectionObserver\(/);
 assert.match(js,/entry\.intersectionRatio>=\.25/);
 assert.match(js,/document\.visibilityState!=='visible'/);
 assert.match(js,/!session\|\|session\.signedIn/);
 assert.match(js,/signupPromptOnCooldown\(\)/);
 assert.match(js,/chartViewedSeconds>=GOLD_CHART_DWELL_SECONDS\)openEmailDialog\(\)/);
 assert.match(js,/localStorage\.setItem\(GOLD_SIGNUP_PROMPT_KEY/);
 assert.match(js,/localStorage\.getItem\(GOLD_SIGNUP_PROMPT_KEY/);
 assert.match(html,/id="trial-explore-preview"/);
 assert.match(html,/id="trial-modal-close"/);
 assert.doesNotMatch(html,/automatic signup|automatic trial/i);
});

test('Free email offer displays actual signed historical P&L, winning trades and return',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../public/trial.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../public/trial.js',import.meta.url),'utf8');
 const css=await readFile(new URL('../public/trial.css',import.meta.url),'utf8');
 assert.match(html,/id="trial-modal-proof"/);
 assert.match(html,/id="trial-modal-profit"/);
 assert.match(html,/id="trial-modal-wins"/);
 assert.match(html,/id="trial-modal-return"/);
 assert.match(html,/RECENT HISTORICAL RESULTS/);
 assert.match(html,/Based on the \$100,000 backtest/);
 assert.match(js,/function updateSignupProof\(item\)/);
 assert.match(js,/stats\?\.trades>0&&Number\.isFinite\(performance\?\.netUsd\)/);
 assert.match(js,/stats\.wins/);
 assert.match(js,/performance\.returnPercent\.toFixed\(2\)/);
 assert.match(js,/Historical net gain/);
 assert.match(js,/Historical net loss/);
 assert.match(js,/proof\.hidden=!hasTrades/);
 assert.match(js,/model=item;updateSignupProof\(item\)/);
 assert.match(css,/trial-modal-proof-grid/);
 assert.doesNotMatch(html,/guaranteed|will earn|miss out on \$[0-9]/i);
});
