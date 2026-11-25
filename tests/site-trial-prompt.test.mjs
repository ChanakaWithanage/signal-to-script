import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const script=await readFile(new URL('../public/site-trial-prompt.js',import.meta.url),'utf8');

function harness({pathname='/',trialSignedIn=false,googleMember=false,storage=null,startAt=100000}={}){
 const state={now:startAt,shows:0,goldShows:0,navigated:null,
  timers:[],nodes:[],urls:[],store:storage||new Map()};
 const listeners=new Map();
 function node(name){
  const n={name,open:false,hidden:false,textContent:'',value:'',disabled:false,
   children:new Map(),listeners:new Map(),
   classList:{toggle(){},add(){},remove(){}},
   addEventListener(event,fn){this.listeners.set(event,fn)},
   querySelector(selector){
    if(!this.children.has(selector))this.children.set(selector,node(selector));
    return this.children.get(selector);
   },
   showModal(){this.open=true;state.shows++},
   close(){this.open=false;this.listeners.get('close')?.()},
   setAttribute(){},append(){}};
  return n;
 }
 const goldModal=node('trial-access-dialog');
 const dialogNodes=[];
 const document={
  visibilityState:'visible',
  body:{append(n){state.nodes.push(n)}},
  head:{append(n){state.nodes.push(n)}},
  createElement(tag){
   const n=node(tag);
   if(tag==='dialog')dialogNodes.push(n);
   return n;
  },
  querySelectorAll(selector){
   if(selector==='dialog[open]')return [...dialogNodes,goldModal].filter(n=>n.open);
   return [];
  },
  getElementById(id){return id==='trial-access-dialog'&&pathname==='/trial.html'?goldModal:null},
  addEventListener(event,fn){listeners.set(event,fn)}
 };
 const window={addEventListener(event,fn){listeners.set(event,fn)}};
 if(pathname==='/trial.html')window.SignalGoldTrial={
  openSignup(){goldModal.open=true;state.goldShows++;return true}
 };
 const fetch=async url=>{
  state.urls.push(String(url));
  const data=url.includes('/trial/session')?{signedIn:trialSignedIn}:
   url.includes('/api/access')?{member:googleMember}:
   url.includes('/api/trial/data')?{
    preview:false,stats:{trades:12,wins:8},
    performanceUsd:{netUsd:4200,returnPercent:4.2},
    market:{availableDays:30}
   }:{ok:true};
  return {ok:true,json:async()=>data};
 };
 const DateShim=class extends Date{static now(){return state.now}};
 const sessionStorage={
  getItem(key){return state.store.get(key)||null},
  setItem(key,value){state.store.set(key,value)}
 };
 const context={window,document,location:{pathname,assign(url){state.navigated=url}},
  sessionStorage,fetch,setInterval(fn,ms){state.timers.push({fn,ms})},
  Date:DateShim,Intl,Number,String,Array,Math,console,AbortSignal};
 vm.runInNewContext(script,context);
 return {state,document,window,goldModal,
  async settle(){await new Promise(resolve=>setImmediate(resolve))},
  async tick(seconds){state.now+=seconds*1000;
   for(const timer of state.timers)await timer.fn();
   await new Promise(resolve=>setImmediate(resolve));
  },
  lastDialog(){return dialogNodes.at(-1)}
 };
}

test('Fresh visitor on homepage gets a real popup by 30 seconds, then again 120 seconds after closing',async()=>{
 const h=harness();
 await h.settle();
 assert.equal(h.state.timers.length,1);
 assert.ok(h.state.urls.includes('/api/trial/session'));
 assert.ok(h.state.urls.includes('/api/access'));
 await h.tick(29);
 assert.equal(h.state.shows,0);
 await h.tick(1);
 assert.equal(h.state.shows,1);
 assert.equal(h.lastDialog().open,true);
 assert.ok(h.lastDialog().querySelector('.sts-trial-marketing').textContent.includes('+$4,200'));
 assert.ok(h.lastDialog().querySelector('.sts-trial-marketing').textContent.includes('4.20%'));
 assert.ok(h.lastDialog().querySelector('.sts-trial-marketing').textContent.includes('8 winning trades'));
 h.lastDialog().close();
 await h.tick(119);
 assert.equal(h.state.shows,1);
 await h.tick(1);
 assert.equal(h.state.shows,2);
});

test('Existing Gold trial sessions and Google members receive no popup',async()=>{
 for(const credentials of [{trialSignedIn:true},{googleMember:true}]){
  const h=harness(credentials);
  await h.settle();
  await h.tick(31);
  await h.tick(125);
  assert.equal(h.state.shows,0);
  assert.equal(h.state.goldShows,0);
 }
});

test('Gold page uses existing signup dialog without a chart visibility requirement',async()=>{
 const h=harness({pathname:'/trial.html'});
 await h.settle();
 await h.tick(30);
 assert.equal(h.state.shows,0);
 assert.equal(h.state.goldShows,1);
 h.goldModal.open=false;
 h.goldModal.listeners.get('close')?.();
 await h.tick(120);
 assert.equal(h.state.goldShows,2);
});

test('Invitation deadline persists across internal page loads in the same browser tab',async()=>{
 const h=harness();
 await h.settle();
 await h.tick(30);
 h.lastDialog().close();
 const next=Number(h.state.store.get('sts_sitewide_gold_trial_next_due_v1'));
 assert.equal(next,h.state.now+120000);
 const second=harness({pathname:'/articles/gold-breakout-session-study.html',
  storage:h.state.store,startAt:h.state.now+60000});
 await second.settle();
 await second.tick(59);
 assert.equal(second.state.shows,0);
 await second.tick(1);
 assert.equal(second.state.shows,1);
 assert.match(script,/sessionStorage\.getItem\(NEXT_DUE_KEY\)/);
 assert.match(script,/sessionStorage\.setItem\(NEXT_DUE_KEY,String\(value\)\)/);
});

test('Every public site page includes the shared site script and no chart-only timer remains',async()=>{
 const treePaths=[
  '404.html','index.html','trial.html','join.html','checkout.html',
  'privacy.html','terms.html','refunds.html',
  'articles/1r-bear-breakout-achievements.html',
  'articles/automate-tradingview-strategies-chrome-extension.html',
  'articles/free-pine-script-backtester-tradingview-alternative.html',
  'articles/gold-breakout-15m-strategy.html',
  'articles/gold-breakout-session-study.html',
  'articles/no-wick-ema-retest-strategy.html',
  'articles/pinbar-3-line-strike-combo-alerts.html',
  'articles/portfolio-trend-dashboard.html',
  'articles/supertrend-dema-reversal-strategy.html'
 ];
 for(const path of treePaths){
  const html=await readFile(new URL('../public/'+path,import.meta.url),'utf8');
  assert.match(html,/src="\/site\.js"/,path);
 }
 const site=await readFile(new URL('../public/site.js',import.meta.url),'utf8');
 const gold=await readFile(new URL('../public/trial.js',import.meta.url),'utf8');
 assert.match(site,/site-trial-prompt\.js\?v=20261125-v1/);
 assert.match(gold,/window\.SignalGoldTrial=\{openSignup:openEmailDialog\}/);
 assert.doesNotMatch(gold,/startGoldChartEngagementPrompt/);
 assert.match(script,/FIRST_PROMPT_MS=30000/);
 assert.match(script,/REPEAT_PROMPT_MS=120000/);
 assert.doesNotMatch(script,/chartViewedSeconds|IntersectionObserver|localStorage/);
 assert.match(script,/sts-gold-trial-joined/);
});
