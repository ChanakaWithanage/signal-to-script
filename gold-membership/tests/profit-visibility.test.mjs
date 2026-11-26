import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Exercise the real money-animation code with a mock viewport and animation clock.
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=app.indexOf('// Each actual profit figure counts up');
const end=app.indexOf('\nasync function api(',start);
assert.ok(start>=0&&end>start,'Profit animation block should exist in app.js');
const code=app.slice(start,end);

function setup({reducedMotion=false,hidden=false,top=100}={}){
 const elements=new Map(),listeners=new Map(),frames=new Map();
 let observer,clock=0,id=0,dialog=null;
 const element=key=>{
  if(!elements.has(key)){
   const attributes=new Map();
   const el={
    textContent:'—',top,width:150,height:40,
    classList:{toggle(){}},
    getBoundingClientRect(){return {top:this.top,bottom:this.top+this.height,
     width:this.width,height:this.height}},
    setAttribute(name,value){attributes.set(name,value)},
    removeAttribute(name){attributes.delete(name)},
    getAttribute(name){return attributes.get(name)}
   };
   elements.set(key,el);
  }
  return elements.get(key);
 };
 class FakeIntersectionObserver{
  constructor(callback,options){this.callback=callback;this.options=options;this.observed=new Set();observer=this}
  observe(el){this.observed.add(el)}
  unobserve(el){this.observed.delete(el)}
  fire(el,ratio){this.callback([{target:el,intersectionRatio:ratio,isIntersecting:ratio>0}])}
 }
 const doc={
  hidden,
  querySelector(){return dialog},
  addEventListener(event,fn){listeners.set(event,fn)}
 };
 const api=runInNewContext(
  "const $=id=>document.getElement(id);"+
  "const currency=n=>Number.isFinite(n)?(n<0?'−':'')+'$'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';\n"+
  code+"\n({animateMoney,resumeVisibleProfits})",
  {document:Object.assign(doc,{getElement:element}),
   window:{innerHeight:800,matchMedia(){return {matches:reducedMotion}}},
   IntersectionObserver:FakeIntersectionObserver,
   requestAnimationFrame(fn){const frame=++id;frames.set(frame,fn);return frame},
   cancelAnimationFrame(frame){frames.delete(frame)},
   performance:{now(){return clock}},
   console}
 );
 return {api,element,observer:()=>observer,pending:()=>frames.size,
  fire(el,ratio){observer.fire(el,ratio)},
  step(ms=100){clock+=ms;const callbacks=[...frames.values()];frames.clear();for(const fn of callbacks)fn(clock)},
  finish(){for(let i=0;i<20&&frames.size;i++)this.step()},
  document:doc,setDialog(value){dialog=value},
  notifyVisible(){doc.hidden=false;listeners.get('visibilitychange')?.();}
 };
}
test('a mobile results counter waits for scroll into view to begin counting',()=>{
 const ui=setup({top:950}),el=ui.element('stat-profit');
 ui.api.animateMoney('stat-profit',12456.78);
 assert.equal(ui.pending(),0,'No frames should run while the counter is below the viewport');
 assert.equal(el.getAttribute('aria-label'),'$12,456.78','The real result stays accessible');
 assert.equal(el.textContent,'$0.00');
 el.top=240;
 ui.fire(el,0.65);
 assert.equal(ui.pending(),1,'Counter should begin animating when visible');
 ui.finish();
 assert.equal(el.textContent,'$12,456.78');
 assert.equal(ui.pending(),0);
});
test('desktop and mobile do not replay unchanged values on repeated data refreshes',()=>{
 const ui=setup(),el=ui.element('hero-profit-value');
 ui.api.animateMoney('hero-profit-value',2500);
 ui.fire(el,0.8);
 ui.finish();
 ui.api.animateMoney('hero-profit-value',2500);
 assert.equal(ui.pending(),0);
 assert.equal(el.textContent,'$2,500.00');
});
test('new results queue until visible even after a previous animation completed',()=>{
 const ui=setup(),el=ui.element('stat-profit');
 ui.api.animateMoney('stat-profit',2500);ui.fire(el,0.75);ui.finish();
 el.top=1300;ui.api.animateMoney('stat-profit',3750);
 assert.equal(ui.pending(),0);
 el.top=180;ui.fire(el,0.9);ui.finish();
 assert.equal(el.textContent,'$3,750.00');
});
test('scrolling away mid-animation pauses until the value is visible again',()=>{
 const ui=setup(),el=ui.element('stat-profit');
 ui.api.animateMoney('stat-profit',3000);ui.fire(el,0.9);
 ui.step(350);
 assert.notEqual(el.textContent,'$3,000.00');
 ui.fire(el,0);
 assert.equal(ui.pending(),0);
 el.top=150;ui.fire(el,0.9);ui.finish();
 assert.equal(el.textContent,'$3,000.00');
});
test('reduced-motion devices immediately display the actual value',()=>{
 const ui=setup({reducedMotion:true}),el=ui.element('proof-profit');
 ui.api.animateMoney('proof-profit',-570.75);
 assert.equal(el.textContent,'−$570.75');
 assert.equal(ui.pending(),0);
});
test('a modal-covered counter waits until the dialog closes',()=>{
 const ui=setup(),el=ui.element('hero-profit-value');
 ui.setDialog({contains(){return false},getBoundingClientRect(){return {top:75,bottom:700}}});
 ui.api.animateMoney('hero-profit-value',4100);
 ui.fire(el,0.9);
 assert.equal(ui.pending(),0);
 ui.setDialog(null);
 ui.api.resumeVisibleProfits();
 ui.finish();
 assert.equal(el.textContent,'$4,100.00');
});
test('a counter clipped by a scrollable mobile dialog does not animate early',()=>{
 const ui=setup({top:580}),el=ui.element('proof-profit');
 ui.setDialog({contains(){return true},getBoundingClientRect(){return {top:90,bottom:550}}});
 ui.api.animateMoney('proof-profit',980);
 ui.api.resumeVisibleProfits();
 assert.equal(ui.pending(),0);
 el.top=280;
 ui.api.resumeVisibleProfits();
 ui.finish();
 assert.equal(el.textContent,'$980.00');
});
