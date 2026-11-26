'use strict';
const $=id=>document.getElementById(id);
const currency=n=>Number.isFinite(n)?(n<0?'−':'')+'$'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const price=n=>Number.isFinite(n)?n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const signed=(n,suffix='')=>Number.isFinite(n)?(n>0?'+':'')+n.toFixed(2)+suffix:'—';
const when=ms=>ms?new Date(ms).toLocaleString('en-GB',{timeZone:'UTC',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+' UTC':'—';
const state={member:false,email:null,expiresAt:null,days:30,viewDays:7,data:null,chart:null,series:null,hi:null,lo:null,bars:[],firstRender:true,loading:false,requestSent:false,offerSeen:false,animateOnNextData:false,lastEventId:null};
let toastTimer;
function toast(message){const el=$('toast');el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,5500)}
// Each actual profit figure counts up only when its own card is visible.
// This preserves the animation on mobile when results load before scrolling.
const profitCounters=new Map();
const profitObserver=typeof IntersectionObserver==='function'?
 new IntersectionObserver(entries=>{
  for(const entry of entries){
   if(entry.isIntersecting){
    if(entry.intersectionRatio>=0.5)startVisibleProfit(entry.target);
   }else{
    pauseProfit(entry.target);
   }
  }
 },{threshold:[0,0.5],rootMargin:'-70px 0px -6% 0px'}):null;

function pauseProfit(el){
 const counter=profitCounters.get(el);
 if(!counter?.frame)return;
 cancelAnimationFrame(counter.frame);counter.frame=null;
 counter.pending=true;
 el.textContent=currency(0);
}

function startVisibleProfit(el){
 const counter=profitCounters.get(el);
 if(!counter?.pending||document.hidden)return;
 // A membership modal may cover the chart; don't animate behind it.
 const modal=document.querySelector('dialog[open]');
 if(modal&&!modal.contains(el))return;
 counter.pending=false;
 if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
  el.textContent=currency(counter.value);profitObserver?.unobserve(el);return;
 }
 if(counter.frame)cancelAnimationFrame(counter.frame);
 const began=performance.now(),duration=1300;
 function tick(now){
  const progress=Math.min(1,(now-began)/duration);
  const eased=1-Math.pow(1-progress,3);
  el.textContent=currency(progress<1?counter.value*eased:counter.value);
  if(progress<1)counter.frame=requestAnimationFrame(tick);
  else{counter.frame=null;profitObserver?.unobserve(el)}
 }
 el.textContent=currency(0);
 counter.frame=requestAnimationFrame(tick);
}

function resumeVisibleProfits(){
 if(document.hidden)return;
 for(const [el,counter] of profitCounters){
  if(!counter.pending)continue;
  const rect=el.getBoundingClientRect();
  if(!rect.height||!rect.width)continue;
  const modal=document.querySelector('dialog[open]');
  if(modal&&!modal.contains(el))continue;
  // For scrollable mobile dialogs, use the dialog's clipped viewport too.
  const container=modal?modal.getBoundingClientRect():null;
  const top=Math.max(rect.top,container?.top??70,modal?0:70);
  const bottom=Math.min(rect.bottom,container?.bottom??window.innerHeight*0.94,window.innerHeight*0.94);
  if(bottom-top>=rect.height*0.5)startVisibleProfit(el);
 }
}

function animateMoney(id,value,{force=false}={}){
 const el=$(id);if(!el)return;
 let counter=profitCounters.get(el);
 if(!counter){
  counter={value:null,pending:false,frame:null};
  profitCounters.set(el,counter);
 }
 if(!Number.isFinite(value)){
  if(counter.frame)cancelAnimationFrame(counter.frame);
  counter.frame=null;counter.pending=false;counter.value=null;
  profitObserver?.unobserve(el);el.textContent='—';el.removeAttribute('aria-label');return;
 }
 el.classList.toggle('negative',value<0);
 el.classList.toggle('positive',value>0);
 if(!force&&counter.value===value)return;
 const wasAnimating=!!counter.frame;
 if(counter.frame)cancelAnimationFrame(counter.frame);
 counter.frame=null;counter.value=value;counter.pending=true;
 // Keep the true amount accessible even before the counter comes on screen.
 el.setAttribute('aria-label',currency(value));
 if(!profitObserver||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
  counter.pending=false;el.textContent=currency(value);return;
 }
 el.textContent=currency(0);
 profitObserver.observe(el);
 // The observer is already attached when a refresh interrupts an active count.
 if(wasAnimating)requestAnimationFrame(resumeVisibleProfits);
}

document.addEventListener('visibilitychange',()=>{
 if(!document.hidden)requestAnimationFrame(resumeVisibleProfits);
});

async function api(path,method='GET',data){
 const options={method,credentials:'same-origin',cache:'no-store'};
 if(data){options.headers={'Content-Type':'application/json'};options.body=JSON.stringify(data)}
 const response=await fetch('/api/'+path,options);
 let body;try{body=await response.json()}catch{body={}}
 if(!response.ok)throw Error(body.error||'Something went wrong. Please retry.');
 return body;
}
function offerText(data,force=false){
 if(!data?.stats||!data.performanceUsd)return;
 const p=data.performanceUsd,s=data.stats;
 const good=Number.isFinite(p.netUsd)&&p.netUsd>0&&p.returnPercent>0;
 animateMoney('proof-profit',s.trades?p.netUsd:NaN,{force});
 $('proof-return').textContent=s.trades?signed(p.returnPercent,'%'):'—';
 $('proof-return').classList.toggle('negative',s.trades>0&&p.returnPercent<0);
 $('proof-wins').textContent=s.wins;
 $('proof-period').textContent='Historical '+Math.max(1,Math.floor(data.market.availableDays))+'-day modeled results · $100,000 capital · 1% fixed risk/trade';
 if(good&&s.wins){
  $('dialog-title').textContent='Historical P&L '+currency(p.netUsd)+'. Get real-time Gold alerts.';
 }else{
  $('dialog-title').textContent='Real-time Gold alerts. No more 30-minute public delay.';
 }
}
function showMode(mode){
 $('tab-request').classList.toggle('active',mode==='request');
 $('tab-login').classList.toggle('active',mode==='login');
 $('request-form').hidden=mode!=='request';
 $('login-form').hidden=mode!=='login';
 $('form-feedback').hidden=true;
 if(mode==='login')$('login-email').focus();else $('request-email').focus();
}
function openDialog(mode='request'){
 if(state.member&&mode==='request'&&state.email)$('request-email').value=state.email;
 const d=$('access-dialog');if(!d.open)d.showModal();
 showMode(mode);state.offerSeen=true;
 requestAnimationFrame(resumeVisibleProfits);
}
function updateAccess(member,email,expiry){
 const previouslyActive=state.member,previousEmail=state.email;
 state.member=!!member;state.email=email||null;state.expiresAt=expiry||null;
 window.GoldRoomAccess={active:state.member,email:state.email,expiresAt:state.expiresAt};
 if(previouslyActive!==state.member||previousEmail!==state.email){
  window.dispatchEvent(new CustomEvent('gold:member-access',{detail:{active:state.member,email:state.email,expiresAt:state.expiresAt}}));
 }
 if(state.member&&!previouslyActive)state.animateOnNextData=true;
 $('member-first').hidden=!state.member;
 $('hero-title').innerHTML=state.member
  ?'Your Gold dashboard. <em>Real-time alerts are active.</em>'
  :'Don\'t watch the next Gold move <em>30 minutes late.</em>';
 document.querySelector('.hero-copy>p').textContent=state.member
  ?'Your Gold strategy results and real-time BUY, SELL and EXIT alerts are here. Review your historical dollar profit, trade history, and latest signals in one place.'
  :'Explore past BUY, SELL and EXIT signals, completed trades and historical returns for free. Members get real-time Gold alerts while public signals arrive 30 minutes later.';
 const badge=state.member?'MEMBER · REAL-TIME ALERTS':'PUBLIC · 30-MIN DELAY';
 for(const id of ['hero-tier','results-delay']){$(id).textContent=badge;$(id).classList.toggle('member',state.member)}
 $('chart-delay-label').textContent=state.member?'REAL-TIME MEMBER ALERTS':'30-MIN DELAY';
 $('chart-delay-label').classList.toggle('member',state.member);
 $('status-kicker').textContent=state.member?'REAL-TIME STRATEGY STATUS':'DELAYED STRATEGY STATUS';
 $('detail-unlock').hidden=state.member;
 $('hero-card-cta').textContent=state.member?'Access valid until '+when(expiry):'Remove the 30-minute delay ↗';
 $('hero-card-cta').disabled=state.member;
 $('delay-banner').hidden=state.member||state.requestSent;
 document.querySelectorAll('.js-join').forEach(btn=>{
  if(btn.id==='hero-card-cta')return;
  if(!btn.dataset.originalText)btn.dataset.originalText=btn.textContent;
  btn.textContent=state.member?'Renew my membership ↗':btn.dataset.originalText;
 });
 if(state.member)$('hero-event-time').textContent='Real-time member alerts · Gold 15M';
}
async function loadSession(){
 try{const s=await api('session');updateAccess(!!s.active,s.email,s.expiresAt)}catch{updateAccess(false)}
}
function setMetrics(data){
 const s=data.stats,p=data.performanceUsd;
 const valid=s?.trades>0&&p&&Number.isFinite(p.netUsd);
 const force=state.animateOnNextData;state.animateOnNextData=false;
 const net=valid?p.netUsd:NaN;
 const isLoss=valid&&net<0;
 document.querySelector('.hero-profit').classList.toggle('loss',isLoss);
 $('member-first').classList.toggle('loss',isLoss);
 document.querySelector('.stat.highlight').classList.toggle('loss',isLoss);
 document.querySelector('.proof').classList.toggle('loss',isLoss);
 // The member's very first number is historical dollar P&L, never the return %.
 animateMoney('member-profit-value',net,{force});
 animateMoney('hero-profit-value',net,{force});
 animateMoney('stat-profit',net,{force});
 $('member-profit-caption').textContent=valid
  ?'Last '+Math.max(1,Math.floor(data.market.availableDays))+' days · '+s.wins+' winning trades · $100,000 model'
  :'Waiting for completed historical trades';
 $('hero-profit-title').textContent='HISTORICAL NET P&L · '+Math.max(1,Math.floor(data.market.availableDays))+' DAYS';
 $('hero-profit-note').textContent='Based on $100,000 capital · 1% fixed risk per trade';
 $('stat-return').textContent=valid?signed(p.returnPercent,'%'):'—';
 $('stat-wins').textContent=s?.wins??'—';
 $('stat-trades').textContent=s?.trades??'—';
 $('stat-winrate').textContent=s?.trades?'Win rate '+s.winRate.toFixed(1)+'%':'No completed trades yet';
 $('stat-drawdown').textContent=valid?currency(p.maxDrawdownUsd):'—';
 $('stat-return').classList.toggle('negative',valid&&p.netUsd<0);
 $('stat-return').classList.toggle('positive',valid&&p.netUsd>0);
 $('metrics-caption').textContent='Historical results · '+Math.max(1,Math.floor(data.market.availableDays))+' days · $100,000 capital · 1% fixed risk per completed trade · $0.30 spread · no compounding.';
 offerText(data,force);
}

function eventName(e){
 return e.type==='EXIT'?'EXIT '+e.side:e.side==='LONG'?'BUY':'SELL';
}
function eventClass(e){return e.type==='EXIT'?'exit':e.side==='LONG'?'buy':'sell'}
function setStatus(data){
 const current=data.current,last=current?.lastEvent;
 $('current-status').textContent=current?.status||'Waiting for setup';
 $('current-detail').textContent=current?.position?
  current.position.side+' from $'+price(current.position.entry)+' · stop $'+price(current.position.stop):
  'Tracking the next confirmed 15-minute setup.';
 $('range-high').textContent=price(current?.range?.high);
 $('range-low').textContent=price(current?.range?.low);
 $('last-event-description').textContent=last?'Latest '+eventName(last)+' · $'+price(last.price)+' · '+when(last.time):'No recent confirmed entry or exit';
 $('hero-event').textContent=last?eventName(last)+' · $'+price(last.price):'Waiting for next setup';
 $('hero-event-time').textContent=(last?when(last.time):'No recent signal')+(state.member?' · Real-time member alerts':' · Public delayed feed');
}
function renderSignals(data){
 const list=$('signals-list');list.replaceChildren();
 const events=[...(data.events||[])].reverse();
 $('signal-count').textContent=events.length+' confirmed events';
 if(!events.length){const p=document.createElement('p');p.className='fine';p.textContent='No confirmed events in the available history.';list.append(p);return}
 for(const event of events.slice(0,40)){
  const b=document.createElement('button');b.type='button';b.className='signal';
  const label=document.createElement('strong');label.className=eventClass(event);label.textContent=eventName(event);
  const time=document.createElement('time');time.textContent=when(event.time);
  const value=document.createElement('b');value.textContent='$'+price(event.price);
  b.append(label,time,value);b.addEventListener('click',()=>focusEvent(event.time));list.append(b);
 }
}
function renderTrades(data){
 const target=$('trade-rows');target.replaceChildren();
 const rows=data.trades||[];
 if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.textContent='No completed trades in this period.';tr.append(td);target.append(tr);return}
 for(const t of rows.slice(0,50)){
  const tr=document.createElement('tr');
  const fields=[when(t.entryTime),t.side,price(t.entry),price(t.exit),t.reason||'—',currency(t.resultUsd)];
  fields.forEach((value,index)=>{const td=document.createElement('td');td.textContent=value;
   if(index===1)td.className=t.side==='LONG'?'positive':'negative';
   if(index===5)td.className=t.resultUsd>=0?'positive':'negative';
   tr.append(td)});
  target.append(tr);
 }
}
function changeRange(days){
 if(!state.chart||!state.bars.length)return;
 state.viewDays=days;
 const cutoff=state.bars.at(-1).time-days*86400;
 const first=state.bars.findIndex(b=>b.time>=cutoff);
 state.chart.timeScale().setVisibleLogicalRange({from:Math.max(0,first),to:state.bars.length+2});
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',Number(b.dataset.view)===days));
}
function focusEvent(ms){
 if(!state.chart)return;
 const seconds=Math.floor(ms/1000);
 const index=state.bars.findIndex(b=>b.time===seconds);
 if(index<0)return;
 state.chart.timeScale().setVisibleLogicalRange({from:Math.max(0,index-58),to:Math.min(state.bars.length+2,index+30)});
}
function draw(data){
 if(!window.LightweightCharts){$('gold-chart').textContent='Chart library unavailable. Historical signals and trade history are still shown below.';return}
 const source=data.candles||[],el=$('gold-chart');
 const bars=source.map(b=>({time:Math.floor(b.time/1000),open:b.open,high:b.high,low:b.low,close:b.close}));
 if(!bars.length)return;
 if(!state.chart){
  el.replaceChildren();
  state.chart=LightweightCharts.createChart(el,{width:el.clientWidth,height:el.clientHeight,
   layout:{background:{color:'#ffffff'},textColor:'#63788b',fontFamily:'Arial,sans-serif',fontSize:11},
   grid:{vertLines:{color:'#f1f4f8'},horzLines:{color:'#ebf0f5'}},
   rightPriceScale:{borderColor:'#e5eaf1'},timeScale:{borderColor:'#e5eaf1',timeVisible:true,secondsVisible:false},
   handleScroll:true,handleScale:true});
  state.series=state.chart.addCandlestickSeries({upColor:'#0ba971',downColor:'#d8626e',
   wickUpColor:'#0ba971',wickDownColor:'#d8626e',borderUpColor:'#0ba971',borderDownColor:'#d8626e',
   priceFormat:{type:'price',precision:2,minMove:.01}});
  const settings={color:'#bea368',lineStyle:LightweightCharts.LineStyle.Dashed,lineWidth:1,
   priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false};
  state.hi=state.chart.addLineSeries(settings);state.lo=state.chart.addLineSeries(settings);
  if(window.ResizeObserver)new ResizeObserver(()=>state.chart.applyOptions({width:el.clientWidth,height:el.clientHeight})).observe(el);
 }
 state.bars=bars;state.series.setData(bars);
 const allowedTimes=new Set(bars.map(b=>b.time));
 const markers=(data.events||[]).filter(e=>allowedTimes.has(Math.floor(e.time/1000))).map(e=>({
  time:Math.floor(e.time/1000),position:e.type==='EXIT'?(e.side==='LONG'?'aboveBar':'belowBar'):(e.side==='LONG'?'belowBar':'aboveBar'),
  shape:e.type==='EXIT'?'circle':e.side==='LONG'?'arrowUp':'arrowDown',
  color:e.type==='EXIT'?'#b2822e':e.side==='LONG'?'#08a56c':'#d54d5f',
  text:e.type==='EXIT'?'EXIT':e.side==='LONG'?'BUY':'SELL',size:e.type==='EXIT'?1.5:2.2
 })).sort((a,b)=>a.time-b.time);
 state.series.setMarkers(markers);
 const ranges=new Map((data.ranges||[]).map(r=>[r.day,r]));
 const high=[],low=[];
 for(const b of source){
  const local=new Date(b.time+3*3600000),date=local.toISOString().slice(0,10),hour=local.getUTCHours(),r=ranges.get(date);
  const time=Math.floor(b.time/1000);
  high.push(r&&hour>=7&&hour<20?{time,value:r.high}:{time});
  low.push(r&&hour>=7&&hour<20?{time,value:r.low}:{time});
 }
 state.hi.setData(high);state.lo.setData(low);
 changeRange(state.viewDays);
}
function syncPeriodButtons(){
 document.querySelectorAll('[data-days]').forEach(b=>b.classList.toggle('active',Number(b.dataset.days)===state.days));
}
function renderData(data){
 const previousEventId=state.lastEventId;
 state.data=data;
 updateAccess(data.access?.tier==='member',state.email,data.access?.expiresAt);
 setMetrics(data);setStatus(data);renderSignals(data);renderTrades(data);draw(data);
 const latest=data.current?.lastEvent;
 if(state.member&&previousEventId&&latest?.id&&latest.id!==previousEventId&&
    Date.now()-latest.time<5*60000){
  toast('REAL-TIME GOLD ALERT · '+eventName(latest)+' at '+currency(latest.price));
 }
 state.lastEventId=latest?.id||null;
 $('feed-description').textContent=data.market.symbol+' · '+data.market.interval+' candles · '+(state.member?'Real-time member alerts':'30-minute delayed public view');
 $('chart-asof').textContent='Latest released candle closed '+when(Date.parse(data.market.lastClosedBar))+(data.market.stale?' · Feed may be stale':'');
 $('chart-source').textContent=data.market.source;
 syncPeriodButtons();
}
async function loadData(){
 if(state.loading)return;state.loading=true;$('refresh').disabled=true;
 try{renderData(await api('data?days='+state.days))}
 catch(e){toast(e.message);if(!state.data){$('gold-chart').textContent='Gold data is temporarily refreshing. Please select refresh to retry.'}}
 finally{state.loading=false;$('refresh').disabled=false}
}
function feedback(message,error=false){const el=$('form-feedback');el.hidden=false;el.classList.toggle('error',error);el.textContent=message}
async function sendRequest(ev){
 ev.preventDefault();
 const b=ev.currentTarget.querySelector('button[type=submit]');b.disabled=true;
 try{
  const result=await api('request','POST',{name:$('request-name').value,email:$('request-email').value,note:$('request-note').value,website:$('website').value});
  state.requestSent=true;feedback('Request received'+(result.id?' ('+result.id+')':'')+'. We will contact you by email with payment instructions. After payment, you will receive your 30-day access code.');
  $('delay-banner').hidden=true;
 }catch(e){feedback(e.message,true)}finally{b.disabled=false}
}
async function sendLogin(ev){
 ev.preventDefault();const b=ev.currentTarget.querySelector('button[type=submit]');b.disabled=true;
 try{
  const result=await api('login','POST',{email:$('login-email').value,code:$('login-code').value});
  updateAccess(true,result.email,result.expiresAt);$('access-dialog').close();toast('Member access activated until '+when(result.expiresAt));
  await loadData();
  // After successful login, lead with the dollar P&L, not the percentage card.
  $('member-first').scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
 }catch(e){feedback(e.message,true)}finally{b.disabled=false}
}
function dismissModal(){
 $('access-dialog').close();
 if(!state.member&&!state.requestSent)$('delay-banner').hidden=false;
}
function wire(){
 document.querySelectorAll('.js-join').forEach(b=>b.addEventListener('click',()=>openDialog('request')));
 document.querySelectorAll('.js-login').forEach(b=>b.addEventListener('click',()=>openDialog('login')));
 $('tab-request').addEventListener('click',()=>showMode('request'));
 $('tab-login').addEventListener('click',()=>showMode('login'));
 $('modal-close').addEventListener('click',dismissModal);
 $('modal-explore').addEventListener('click',dismissModal);
 $('access-dialog').addEventListener('close',()=>{
  if(!state.member&&!state.requestSent)$('delay-banner').hidden=false;
  requestAnimationFrame(resumeVisibleProfits);
 });
 $('request-form').addEventListener('submit',sendRequest);$('login-form').addEventListener('submit',sendLogin);
 $('refresh').addEventListener('click',loadData);
 $('hide-banner').addEventListener('click',()=>$('delay-banner').hidden=true);
 document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>changeRange(Number(b.dataset.view))));
 document.querySelectorAll('[data-days]').forEach(b=>b.addEventListener('click',async()=>{
  const next=Number(b.dataset.days);
  if(next===60&&!state.member){openDialog('request');toast('60-day history is included with membership.');return}
  state.days=next;syncPeriodButtons();await loadData();
 }));
 // The first invitation appears within one minute, followed by a two-minute
 // re-invitation after dismissal. Requests stop prompts for this page session.
 setTimeout(()=>{if(!state.member&&!state.requestSent&&!$('access-dialog').open)openDialog('request')},45000);
 setInterval(()=>{if(!state.member&&!state.requestSent&&state.offerSeen&&!$('access-dialog').open)openDialog('request')},120000);
 setInterval(loadData,30000);
 setInterval(async()=>{
  if(state.member&&state.expiresAt&&Date.now()>=state.expiresAt){updateAccess(false);state.days=30;await loadData();openDialog('login')}
 },30000);
}
wire();loadSession().then(loadData);
