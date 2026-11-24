/* Gold Breakout alert workspace: chart first, email registration inside the workspace. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const workspace=$('trial-workspace'),flash=$('trial-flash');
const accessDialog=$('trial-access-dialog'),upgradeDialog=$('trial-upgrade-dialog');
const fmtPrice=n=>typeof n==='number'?new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n):'—';
const fmtTime=t=>t?new Date(t).toLocaleString('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false})+' UTC':'—';
const DAY_MS=86400000;
let session=null,model=null,chart=null,candles=null,highLine=null,lowLine=null,loading=false,days=30;
function message(text){flash.textContent=text;flash.hidden=!text}
async function api(path,options={}){
 const res=await fetch('/api/trial/'+path,{credentials:'same-origin',cache:'no-store',...options});
 let data;try{data=await res.json()}catch{throw Error('The service returned an unexpected response.')}
 if(!res.ok){const e=new Error(data.error||'Unable to complete this request.');e.code=data.code;e.status=res.status;throw e}
 return data;
}
const post=(path,data)=>api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
function openEmailDialog(){
 if(session?.active){return}
 if(session?.signedIn){message('Your free alert access has finished. Choose lifetime access to keep alerts running.');return}
 if(!accessDialog.open)accessDialog.showModal();
}
function openUpgradeDialog(){
 if(!upgradeDialog.open)upgradeDialog.showModal();
}
function updateAccess(){
 const signed=!!session?.signedIn,member=!!session?.lifetime,active=!!session?.active;
 const eligible=signed&&!member&&(Date.now()-session.createdAt>=5*DAY_MS);
 $('trial-access-card').hidden=!signed;
 $('trial-activate').hidden=active||signed;
 $('trial-start-alerts').hidden=active;
 $('trial-start-alerts').textContent=signed?'Continue Gold Breakout alerts':'Get Gold Breakout alerts for free';
 $('trial-workspace-upsell').hidden=!eligible;
 $('trial-access-upgrade').hidden=!eligible;
 $('trial-redeem').hidden=!signed;
 $('trial-extended').querySelector('span').textContent=member?'Unlocked':eligible?'Lifetime':'More history';
 if(!signed)return;
 if(member){
  $('trial-access-label').textContent='LIFETIME MEMBER';
  $('trial-days-left').textContent='Unlimited access';
  $('trial-expiry').textContent='No renewals or recurring payments';
  $('trial-progress').style.width='100%';
 }else{
  const remaining=Math.max(0,session.expiresAt-Date.now());
  $('trial-access-label').textContent=active?'YOUR ALERT ACCESS':'YOUR ACCESS';
  $('trial-days-left').textContent=active?(session.remainingDays===1?'1 day remaining':session.remainingDays+' days remaining'):'Free access complete';
  $('trial-expiry').textContent=active?'Active until '+new Date(session.expiresAt).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'Explore the chart below or continue with lifetime access';
  $('trial-progress').style.width=Math.max(0,remaining/(7*DAY_MS)*100)+'%';
 }
}
function updatePreferences(){
 const active=!!session?.active;
 $('trial-email-alerts').checked=active&&!!session.emailAlerts;
 $('trial-email-alerts').disabled=active&&!session?.delivery?.emailReady;
 $('trial-discord-status').textContent=active&&session.discordConnected?'Connected to your channel':'Add your channel webhook';
 $('trial-discord-toggle').textContent=active&&session.discordConnected?'Edit':'Connect';
 $('trial-discord-toggle').disabled=active&&!session?.delivery?.discordReady;
 $('trial-telegram-status').textContent=active&&session.telegramConnected?'Telegram connected':'Connect with one click';
 $('trial-telegram-connect').textContent=active&&session.telegramConnected?'Disconnect':'Connect';
 $('trial-telegram-connect').disabled=active&&!session?.delivery?.telegramReady;
 $('trial-alerts-note').textContent=!active?
   'Explore the chart now. Activate your free alerts with a secure email link.':
   !session.delivery?.emailReady&&!session.delivery?.discordReady&&!session.delivery?.telegramReady?
   'Notification delivery is being configured. Chart signals and backtests are available now.':
   'Notifications are delivered on newly confirmed entry and exit events.';
}
async function showUpgradeIfDue(){
 if(!session?.signedIn||session.lifetime||Date.now()-session.createdAt<5*DAY_MS)return;
 try{
  const result=await post('offer',{});
  if(result.show&&!accessDialog.open)openUpgradeDialog();
 }catch(error){console.error('Membership prompt unavailable',error)}
}
async function loadSession({prompt=true}={}){
 session=await api('session');
 updateAccess();updatePreferences();
 if(!session.signedIn&&prompt)openEmailDialog();
 if(session.signedIn&&accessDialog.open)accessDialog.close();
 await loadData();
 if(session.signedIn&&prompt)await showUpgradeIfDue();
}
async function verifyLink(token){
 message('Confirming your private access link…');
 try{
  await post('verify',{token});
  if(accessDialog.open)accessDialog.close();
  message('');
  await loadSession({prompt:false});
  message('Your Gold Breakout workspace is ready. Configure your preferred alert channels.');
 }catch(error){
  message(error.message);openEmailDialog();
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
 finally{button.disabled=false;button.textContent='Start for free →'}
});
$('trial-try-another').addEventListener('click',()=>{form.hidden=false;$('trial-email-sent').hidden=true;$('trial-email').focus()});
$('trial-modal-close').addEventListener('click',()=>accessDialog.close());
$('trial-explore-preview').addEventListener('click',()=>accessDialog.close());
$('trial-upgrade-close').addEventListener('click',()=>upgradeDialog.close());
$('trial-upgrade-later').addEventListener('click',()=>upgradeDialog.close());
$('trial-activate').addEventListener('click',openEmailDialog);
$('trial-start-alerts').addEventListener('click',()=>{
 if(session?.signedIn&&!session?.active)openUpgradeDialog();else openEmailDialog();
});
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
 $('trial-period-title').textContent=item.preview?'30':days;
 if(item.preview||!item.stats){
  for(const id of ['trial-metric-trades','trial-metric-win','trial-metric-net','trial-metric-pf','trial-metric-dd'])$(id).textContent='—';
  $('trial-metric-net').className='';
  $('trial-trades-caption').textContent='Activate alerts to unlock 30-day trade results';
  return;
 }
 const s=item.stats;
 $('trial-metric-trades').textContent=s.trades;
 $('trial-metric-win').textContent=s.winRate.toFixed(1)+'%';
 $('trial-metric-net').textContent=(s.netR>0?'+':'')+s.netR.toFixed(2)+'R';
 $('trial-metric-net').className=s.netR>0?'trial-positive':s.netR<0?'trial-negative':'';
 $('trial-metric-pf').textContent=s.profitFactor===null?'—':s.profitFactor.toFixed(2);
 $('trial-metric-dd').textContent=s.maxDrawdownR.toFixed(2)+'R';
 $('trial-trades-caption').textContent='Latest completed trades first';
}
function showTrades(rows,preview=false){
 const tbody=$('trial-trade-rows');tbody.replaceChildren();
 if(preview){
  const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;
  td.textContent='30-day trade history is included when you activate your free alerts.';
  const button=document.createElement('button');button.type='button';button.className='trial-text-link';
  button.textContent='Unlock full history';button.addEventListener('click',()=>{
   if(session?.signedIn&&!session.active)openUpgradeDialog();else openEmailDialog();
  });
  td.append(' ',button);tr.append(td);tbody.append(tr);return;
 }
 if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;
  td.textContent='No completed trades in this period. The chart remains available for signals.';tr.append(td);tbody.append(tr);return}
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
  model=item;currentDetails(item);writeMetrics(item);showTrades(item.trades,item.preview);
  drawChart(item);
  $('trial-asof').textContent='Last confirmed candle '+fmtTime(Date.parse(item.market.lastClosedBar));
  $('trial-source').textContent=item.market.source;
  const age=Date.now()-Date.parse(item.market.lastClosedBar);
  $('trial-online-status').textContent=age<60*60000?'Updated':'Latest session';
  $('trial-preview-lock').hidden=!item.preview;
  $('trial-preview-lock-text').textContent=session?.signedIn?
    'Your free alert period is complete. Lifetime access unlocks full history and notifications.':
    'Explore recent gold candles now. Activate your free alerts to unlock the full 30-day history.';
  $('trial-preview-unlock').textContent=session?.signedIn?'Continue with lifetime access':'Activate free alerts';
  message('');
 }catch(error){message(error.message)}
 finally{loading=false;$('trial-refresh').disabled=false}
}
$('trial-preview-unlock').addEventListener('click',()=>{
 if(session?.signedIn&&!session.active)openUpgradeDialog();else openEmailDialog();
});
document.querySelectorAll('[data-days]').forEach(button=>button.addEventListener('click',async()=>{
 const next=Number(button.dataset.days);
 if(next===60&&!session?.lifetime){
  message('Extended backtesting is available with lifetime access. You can explore the live chart and free results now.');
  return;
 }
 days=next;document.querySelectorAll('[data-days]').forEach(b=>{
  b.classList.toggle('active',Number(b.dataset.days)===days);
  b.setAttribute('aria-pressed',String(Number(b.dataset.days)===days));
 });
 await loadData();
}));
$('trial-refresh').addEventListener('click',loadData);
$('trial-email-alerts').addEventListener('change',async e=>{
 const el=e.target;
 if(!session?.active){el.checked=false;if(session?.signedIn)openUpgradeDialog();else openEmailDialog();return}
 el.disabled=true;
 try{await post('preferences',{action:'email',enabled:el.checked});session.emailAlerts=el.checked;message('Email alert preference saved.')}
 catch(error){el.checked=!el.checked;message(error.message)}
 finally{el.disabled=!session.delivery.emailReady}
});
$('trial-discord-toggle').addEventListener('click',()=>{
 if(!session?.active){if(session?.signedIn)openUpgradeDialog();else openEmailDialog();return}
 const form=$('trial-discord-form');form.hidden=!form.hidden;if(!form.hidden)$('trial-discord-url').focus();
});
$('trial-discord-form').addEventListener('submit',async e=>{
 e.preventDefault();
 if(!session?.active){openEmailDialog();return}
 try{
  const hook=$('trial-discord-url').value.trim();
  if(!hook)throw Error('Paste your Discord channel webhook URL.');
  const result=await post('preferences',{action:'discord',webhook:hook});
  session.discordConnected=result.discordConnected;$('trial-discord-url').value='';
  $('trial-discord-form').hidden=true;updatePreferences();message('Discord channel connected.');
 }catch(error){message(error.message)}
});
$('trial-discord-remove').addEventListener('click',async()=>{
 if(!session?.active)return;
 try{
  await post('preferences',{action:'discord',webhook:''});session.discordConnected=false;
  $('trial-discord-url').value='';$('trial-discord-form').hidden=true;updatePreferences();message('Discord channel removed.');
 }catch(error){message(error.message)}
});
$('trial-telegram-connect').addEventListener('click',async()=>{
 if(!session?.active){if(session?.signedIn)openUpgradeDialog();else openEmailDialog();return}
 try{
  if(session.telegramConnected){
   await post('preferences',{action:'telegram-remove'});
   session.telegramConnected=false;updatePreferences();message('Telegram disconnected.');return;
  }
  const {telegramUrl}=await post('preferences',{action:'telegram-link'});
  window.open(telegramUrl,'_blank','noopener,noreferrer');
  message('Open Telegram and tap Start to connect your alerts.');
 }catch(error){message(error.message)}
});
async function redeem(formEl){
 const field=formEl.querySelector('input'),status=formEl.querySelector('[role=status]');
 status.textContent='Checking your membership…';
 try{
  const url=new URL(field.value.trim());
  if(!['signaltoscript.com','www.signaltoscript.com',location.hostname].includes(url.hostname))
   throw Error('Paste a Signal to Script membership receipt link.');
  const hash=new URLSearchParams(url.hash.slice(1)),query=url.searchParams;
  const receipt={method:hash.get('method')||query.get('method')||'crypto',
   id:hash.get('id')||query.get('id'),secret:hash.get('secret')||query.get('secret')};
  if(!receipt.id||!receipt.secret)throw Error('This link does not include a complete membership receipt.');
  await post('redeem',receipt);
  status.textContent='Lifetime membership activated.';
  if(upgradeDialog.open)upgradeDialog.close();
  await loadSession({prompt:false});
  message('Your lifetime features are now available.');
 }catch(error){status.textContent=error.message}
}
$('trial-redeem-form').addEventListener('submit',e=>{e.preventDefault();redeem(e.target)});
window.addEventListener('focus',async()=>{
 try{
  if(session?.signedIn){
   await loadSession({prompt:false});
   await showUpgradeIfDue();
  }
 }catch{}
});
let lastAccountRefresh=Date.now();
setInterval(async()=>{
 if(document.visibilityState!=='visible')return;
 await loadData();
 // Tabs left open for days still receive the day-five membership reminder.
 if(session?.signedIn&&Date.now()-lastAccountRefresh>=20*60*1000){
  lastAccountRefresh=Date.now();
  try{
   await loadSession({prompt:false});
   await showUpgradeIfDue();
  }catch(error){console.error('Trial status refresh failed',error)}
 }
},60000);
(async()=>{
 const verify=new URLSearchParams(location.search).get('verify');
 if(verify){
  history.replaceState(null,'',location.pathname);
  await verifyLink(verify);
 }else{
  try{await loadSession()}
  catch(error){
   message(error.message);
   session={signedIn:false,active:false};
   updateAccess();updatePreferences();openEmailDialog();
   await loadData();
  }
 }
})();
})();
