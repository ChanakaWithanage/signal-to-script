import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const script=await readFile(new URL('../public/site-trial-prompt.js',import.meta.url),'utf8');

function harness({path='/',storage=new Map(),startAt=100000}={}){
 const timers=[],dialogs=[],head=[],body=[];
 let now=startAt;
 const node=name=>({
  name,open:false,innerHTML:'',children:new Map(),listeners:new Map(),
  setAttribute(){},addEventListener(type,fn){this.listeners.set(type,fn)},
  querySelector(selector){
   if(!this.children.has(selector))this.children.set(selector,node(selector));
   return this.children.get(selector);
  },
  showModal(){this.open=true},
  close(){this.open=false;this.listeners.get('close')?.()}
 });
 const document={
  head:{append(n){head.push(n)}},body:{append(n){body.push(n)}},visibilityState:'visible',
  createElement(tag){const n=node(tag);if(tag==='dialog')dialogs.push(n);return n},
  querySelectorAll(selector){return selector==='dialog[open]'?dialogs.filter(n=>n.open):[]}
 };
 const window={};
 const location={pathname:path};
 const sessionStorage={
  getItem(key){return storage.get(key)||null},
  setItem(key,value){storage.set(key,value)}
 };
 class DateShim extends Date{static now(){return now}}
 vm.runInNewContext(script,{window,document,location,sessionStorage,Date:DateShim,
  setInterval(fn,ms){timers.push({fn,ms})},Array,Number,String,console});
 return {timers,dialogs,head,storage,
  tick(seconds){now+=seconds*1000;for(const t of timers)t.fn()},
  last(){return dialogs.at(-1)}
 };
}
test('Gold Room promotion opens at 30 seconds and repeats two minutes after dismissal',()=>{
 const h=harness();
 h.tick(29);assert.equal(h.dialogs.length,0);
 h.tick(1);assert.equal(h.dialogs.length,1);
 assert.equal(h.last().open,true);
 assert.match(h.last().innerHTML,/BLACK FRIDAY.*37\.5% OFF/);
 assert.match(h.last().innerHTML,/\$25\.00/);
 assert.match(h.last().innerHTML,/<del>\$40\.00<\/del>/);
 assert.match(h.last().innerHTML,/https:\/\/gold\.signaltoscript\.com\/pricing\.html/);
 h.last().close();h.tick(119);assert.equal(h.last().open,false);
 h.tick(1);assert.equal(h.last().open,true);
});
test('Clicking the Gold pricing link prevents repeating the promotion in the same tab',()=>{
 const h=harness();h.tick(30);
 h.last().querySelector('.sts-trial-primary').listeners.get('click')?.();
 assert.equal(h.storage.get('sts_gold_room_offer_clicked_v2'),'1');
 h.last().close();h.tick(300);
 assert.equal(h.last().open,false);
});
test('Invitation remembers its next due time across page navigation',()=>{
 const storage=new Map(),first=harness({storage});
 first.tick(30);first.last().close();
 const second=harness({storage,startAt:100000+30*1000+60000,path:'/articles/gold-breakout-session-study.html'});
 second.tick(59);assert.equal(second.dialogs.length,0);
 second.tick(1);assert.equal(second.last().open,true);
});
test('Retired trial page does not launch the promotional popup',()=>{
 const h=harness({path:'/trial.html'});
 h.tick(300);assert.equal(h.dialogs.length,0);
 assert.equal(h.timers.length,0);
});
test('Every main-domain HTML page retains site.js; new offer does not call legacy Gold trial APIs',async()=>{
 const pages=['404.html','index.html','trial.html','join.html','checkout.html',
  'privacy.html','terms.html','refunds.html',
  'articles/gold-breakout-15m-strategy.html',
  'articles/gold-breakout-session-study.html'];
 for(const p of pages){
  const html=await readFile(new URL('../public/'+p,import.meta.url),'utf8');
  assert.match(html,/src="\/site\.js"/,p);
 }
 const site=await readFile(new URL('../public/site.js',import.meta.url),'utf8');
 assert.match(site,/site-trial-prompt\.js\?v=20261127-gold-pricing/);
 assert.doesNotMatch(script,/\/api\/trial\//);
 assert.doesNotMatch(script,/Get my free/);
});
