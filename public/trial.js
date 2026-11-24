/* Gold Breakout customer workspace. Trade logic stays in Cloudflare Functions. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const intro=$('trial-intro'),workspace=$('trial-workspace'),expired=$('trial-expired'),flash=$('trial-flash');
const fmtPrice=n=>typeof n==='number'?new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n):'—';
const fmtTime=t=>t?new Date(t).toLocaleString('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false})+' UTC':'—';
let session=null,model=null,chart=null,candles=null,highLine=null,lowLine=null,loading=false,days=30;
function message(text){flash.textContent=text;flash.hidden=!text}
async function api(path,options={}){
 const res=await fetch('/api/trial/'+path,{credentials:'same-origin',cache:'no-store',...options});
 let data;try{data=await res.json()}catch{throw Error('The service returned an unexpected response.')}
 if(!res.ok){const e=new Error(data.error||'Unable to complete this request.');e.code=data.code;e.status=res.status;throw e}
 return data;
}
const post=(path,data)=>api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
function show(which){intro.hidden=which!=='intro';workspace.hidden=which!=='workspace';expired.hidden=which!=='expired'}
function updateAccess(){
 if(!session?.signedIn)return;
 if(session.lifetime){
  $('trial-access-label').textContent='LIFETIME MEMBER';
  $('trial-days-left').textContent='Unlimited access';
  $('trial-expiry').textContent='No renewals or recurring payments';
  $('trial-progress').style.width='100%';
  $('trial-extended').querySelector('span').textContent='Unlocked';
 }else{
  const remaining=Math.max(0,session.expiresAt-Date.now());
  $('trial-days-left').textContent=(session.remainingDays===1?'1 day':' '+session.remainingDays+' days')+' remaining';
  $('trial-expiry').textContent='Access through '+new Date(session.expiresAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  $('trial-progress').style.width=Math.max(0,remaining/(7*86400000)*100)+'%';
 }
}
function updatePreferences(){
 if(!session)return;
 $('trial-email-alerts').checked=!!session.emailAlerts;
 $('trial-email-alerts').disabled=!session.delivery?.emailReady;
 $('trial-discord-status').textContent=session.discordConnected?'Connected to your channel':'Add your channel webhook';
 $('trial-discord-toggle').textContent=session.discordConnected?'Edit':'Connect';
 $('trial-discord-toggle').disabled=!session.delivery?.discordReady;
 $('trial-telegram-status').textContent=session.telegramConnected?'Telegram connected':'Connect with one click';
 $('trial-telegram-connect').textContent=session.telegramConnected?'Disconnect':'Connect';
 $('trial-telegram-connect').disabled=!session.delivery?.telegramReady;
 const unavailable=[];
 if(!session.delivery?.emailReady)unavailable.push('Email');
 if(!session.delivery?.discordReady)unavailable.push('Discord');
 if(!session.delivery?.telegramReady)unavailable.push('Telegram');
 $('trial-alerts-note').textContent=unavailable.length===3?
   'Notification delivery is being configured. Chart signals and backtests are available now.':
   'Entry and exit notifications are delivered on newly confirmed signals.';
}
async function loadSession(){
 session=await api('session');
 if(!session.signedIn){show('intro');return}
 if(!session.active){show('expired');return}
 show('workspace');updateAccess();updatePreferences();await loadData();
}
async function verifyLink(token){
 message('Verifying your private access link…');
 try{
  await post('verify',{token});
  message('');
  await loadSession();
 }catch(error){
  show('intro');
  message(error.message);
 }
}
const form=$('trial-start-form');
form.addEventListener('submit',async e=>{
 e.preventDefault();if(!form.reportValidity())return;
 const button=$('trial-start-button');button.disabled=true;button.textContent='Sending your secure link…';message('');
 try{
  const email=$('trial-email').value.trim();
  await post('start',{email,website:$('trial-website').value});
  form.hidden=true;$('trial-email-sent').hidden=false;$('trial-confirm-email').textContent=email;
 }catch(error){message(error.message)}
 finally{button.disabled=false;button.textContent='Get my free access link →'}
});
$('trial-try-another').addEventListener('click',()=>{form.hidden=false;$('trial-email-sent').hidden=true;$('trial-email').focus()});
function currentDetails(item){
 const c=item.current;
 $('trial-current-status').textContent=c.status;
 $('trial-current-detail').textContent=c.position?
  c.position.side+' from $'+fmtPrice(c.position.entry)+' · stop $'+fmtPrice(c.position.stop):
  'Tracking the next confirmed 15-minute setup.';
 $('trial-range-high').textContent=fmtPrice(c.range?.high);
 $('trial-range-low').textContent=fmtPrice(c.range?.low);
 const event=c.lastEvent;
 $('trial-last-event').textContent=event?(event.type==='EXIT'?'EXIT '+event.side:event.side+' ENTRY')+' · $'+fmtPrice(event.price):'No recent event';
 $('trial-last-time').textContent=event?fmtTime(event.time):'Waiting for confirmed signals';
}
function writeMetrics(item){
 const s=item.stats;
 $('trial-metric-trades').textContent=s.trades;
 $('trial-metric-win').textContent=s.winRate.toFixed(1)+'%';
 $('trial-metric-net').textContent=(s.netR>0?'+':'')+s.netR.toFixed(2)+'R';
 $('trial-metric-net').className=s.netR>0?'trial-positive':s.netR<0?'trial-negative':'';
 $('trial-metric-pf').textContent=s.profitFactor===null?'—':s.profitFactor.toFixed(2);
 $('trial-metric-dd').textContent=s.maxDrawdownR.toFixed(2)+'R';
 $('trial-period-title').textContent=days;
}
function showTrades(rows){
 const tbody=$('trial-trade-rows');tbody.replaceChildren();
 if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;
  td.textContent='No completed trades in this period. The chart remains available for live signals.';tr.append(td);tbody.append(tr);return}
 for(const item of rows.slice(0,45)){
  const tr=document.createElement('tr');
  const values=[fmtTime(item.entryTime),item.side,fmtPrice(item.entry),fmtPrice(item.exit),item.reason,(item.r>0?'+':'')+item.r.toFixed(2)+'R'];
  values.forEach((value,i)=>{const td=document.createElement('td');td.textContent=value;
   if(i===1)td.className=item.side==='LONG'?'trial-long':'trial-short';
   if(i===5)td.className=item.r>=0?'trial-positive':'trial-negative';
   tr.append(td)});
  tbody.append(tr);
 }
}
function drawChart(item){
 const box=$('trial-chart');
 if(!window.LightweightCharts){
  box.replaceChildren();const p=document.createElement('div');p.className='trial-loading-chart';
  p.textContent='The chart library could not load. Your signals and historical results are shown below.';box.append(p);return;
 }
 const barData=item.candles.map(b=>({time:Math.floor(b.time/1000),open:b.open,high:b.high,low:b.low,close:b.close}));
 if(!barData.length)return;
 if(!chart){
  box.replaceChildren();
  chart=LightweightCharts.createChart(box,{width:box.clientWidth,height:box.clientHeight,
   layout:{background:{color:'#ffffff'},textColor:'#687b70',fontFamily:'Arial, sans-serif',fontSize:11},
   grid:{vertLines:{color:'#f2f6f3'},horzLines:{color:'#ecf2ee'}},
   rightPriceScale:{borderColor:'#e4eee5'},timeScale:{borderColor:'#e4eee5',timeVisible:true,secondsVisible:false},
   crosshair:{mode:LightweightCharts.CrosshairMode.Normal},
   handleScale:true,handleScroll:true});
  candles=chart.addCandlestickSeries({upColor:'#26a574',downColor:'#d45c63',borderUpColor:'#26a574',borderDownColor:'#d45c63',
   wickUpColor:'#26a574',wickDownColor:'#d45c63',priceFormat:{type:'price',precision:2,minMove:.01}});
  highLine=chart.addLineSeries({color:'#9a83c4',lineWidth:1,lineStyle:LightweightCharts.LineStyle.Dashed,
   priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
  lowLine=chart.addLineSeries({color:'#9a83c4',lineWidth:1,lineStyle:LightweightCharts.LineStyle.Dashed,
   priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
  new ResizeObserver(()=>{if(chart)chart.applyOptions({width:box.clientWidth,height:box.clientHeight})}).observe(box);
 }
 candles.setData(barData);
 const markerData=item.events.map(e=>({
  time:Math.floor(e.time/1000),
  position:e.type==='EXIT'?'inBar':e.side==='LONG'?'belowBar':'aboveBar',
  shape:e.type==='EXIT'?'circle':e.side==='LONG'?'arrowUp':'arrowDown',
  color:e.type==='EXIT'?'#b78a3d':e.side==='LONG'?'#22a071':'#db595e',
  text:e.type==='EXIT'?'EXIT':e.side==='LONG'?'BUY':'SELL',
  size:e.type==='EXIT'?1:1.4
 })).sort((a,b)=>a.time-b.time);
 candles.setMarkers(markerData);
 const ranges=item.ranges||[];
 const highs=[],lows=[];
 // Whitespace points break the prior day's lines, never connect unrelated session ranges.
 for(const b of item.candles){
  const d=new Date(b.time+3*3600000),date=d.toISOString().slice(0,10),hour=d.getUTCHours();
  const range=ranges.find(r=>r.day===date);
  const time=Math.floor(b.time/1000);
  if(range&&hour>=7&&hour<20){highs.push({time,value:range.high});lows.push({time,value:range.low})}
  else{highs.push({time});lows.push({time})}
 }
 highLine.setData(highs);lowLine.setData(lows);
 chart.timeScale().fitContent();
}
async function loadData(){
 if(loading)return;
 loading=true;$('trial-refresh').disabled=true;
 try{
  const item=await api('data?days='+days);
  model=item;currentDetails(item);writeMetrics(item);showTrades(item.trades);
  drawChart(item);
  $('trial-asof').textContent='Last confirmed candle '+fmtTime(Date.parse(item.market.lastClosedBar));
  $('trial-source').textContent=item.market.source;
  const age=Date.now()-Date.parse(item.market.lastClosedBar);
  $('trial-online-status').textContent=age<60*60000?'Updated':'Latest session';
  message('');
 }catch(error){if(error.code==='TRIAL_ENDED'){show('expired');return}message(error.message)}
 finally{loading=false;$('trial-refresh').disabled=false}
}
document.querySelectorAll('[data-days]').forEach(button=>button.addEventListener('click',async()=>{
 const next=Number(button.dataset.days);
 if(next===60&&!session?.lifetime){message('The 60-day backtest is included with lifetime membership. Explore the pass below.');$('trial-workspace').querySelector('.trial-workspace-upsell').scrollIntoView({behavior:'smooth',block:'center'});return}
 days=next;document.querySelectorAll('[data-days]').forEach(b=>{b.classList.toggle('active',Number(b.dataset.days)===days);b.setAttribute('aria-pressed',String(Number(b.dataset.days)===days))});
 await loadData();
}));
$('trial-refresh').addEventListener('click',loadData);
$('trial-email-alerts').addEventListener('change',async e=>{
 const el=e.target;el.disabled=true;
 try{await post('preferences',{action:'email',enabled:el.checked});session.emailAlerts=el.checked;message('Email alert preference saved.')}
 catch(error){el.checked=!el.checked;message(error.message)}
 finally{el.disabled=!session.delivery.emailReady}
});
$('trial-discord-toggle').addEventListener('click',()=>{const form=$('trial-discord-form');form.hidden=!form.hidden;if(!form.hidden)$('trial-discord-url').focus()});
$('trial-discord-form').addEventListener('submit',async e=>{
 e.preventDefault();try{const hook=$('trial-discord-url').value.trim();if(!hook)throw Error('Paste your Discord channel webhook URL.');
  const result=await post('preferences',{action:'discord',webhook:hook});
  session.discordConnected=result.discordConnected;$('trial-discord-url').value='';$('trial-discord-form').hidden=true;updatePreferences();message('Discord channel connected.')}
 catch(error){message(error.message)}
});
$('trial-discord-remove').addEventListener('click',async()=>{
 try{await post('preferences',{action:'discord',webhook:''});session.discordConnected=false;
  $('trial-discord-url').value='';$('trial-discord-form').hidden=true;updatePreferences();message('Discord channel removed.')}
 catch(error){message(error.message)}
});
$('trial-telegram-connect').addEventListener('click',async()=>{
 try{
  if(session.telegramConnected){await post('preferences',{action:'telegram-remove'});session.telegramConnected=false;updatePreferences();message('Telegram disconnected.');return}
  const {telegramUrl}=await post('preferences',{action:'telegram-link'});
  window.open(telegramUrl,'_blank','noopener,noreferrer');message('Open Telegram and tap Start to connect your alerts.');
 }catch(error){message(error.message)}
});
async function redeem(formEl){
 const field=formEl.querySelector('input'),status=formEl.querySelector('[role=status]');
 status.textContent='Checking your membership…';
 try{
  const url=new URL(field.value.trim());
  if(!['signaltoscript.com','www.signaltoscript.com',location.hostname].includes(url.hostname))throw Error('Paste a Signal to Script membership receipt link.');
  const hash=new URLSearchParams(url.hash.slice(1)),query=url.searchParams;
  const receipt={method:hash.get('method')||query.get('method')||'crypto',
   id:hash.get('id')||query.get('id'),secret:hash.get('secret')||query.get('secret')};
  if(!receipt.id||!receipt.secret)throw Error('This link does not include a complete membership receipt.');
  await post('redeem',receipt);
  status.textContent='Lifetime membership activated.';
  await loadSession();message('Welcome back. Your lifetime features are now unlocked.');
 }catch(error){status.textContent=error.message}
}
for(const id of ['trial-redeem-form','trial-expired-redeem-form'])$(id).addEventListener('submit',e=>{e.preventDefault();redeem(e.target)});
window.addEventListener('focus',async()=>{
 if(!session?.signedIn||!session.active)return;
 try{const next=await api('session');if(next.signedIn){session=next;updatePreferences();if(!next.active)show('expired')}}catch{}
});
setInterval(()=>{if(session?.active&&document.visibilityState==='visible')loadData()},60000);
(async()=>{
 const verify=new URLSearchParams(location.search).get('verify');
 if(verify){history.replaceState(null,'',location.pathname);await verifyLink(verify)}
 else try{await loadSession()}catch(error){show('intro');message(error.message)}
})();
})();
