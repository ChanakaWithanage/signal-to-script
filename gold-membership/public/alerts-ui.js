(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 let active=false,expiresAt=null,snapshot=null,requesting=false,lastLoaded=0,pendingTelegram=false;
 function feedback(message,isError=false){
  const el=$('alert-feedback');el.hidden=false;el.textContent=message;el.classList.toggle('error',isError);
 }
 function timeText(ms){
  return ms?new Date(ms).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'';
 }
 async function api(action,payload){
  const response=await fetch('/api/alerts',{
   method:action,cache:'no-store',credentials:'same-origin',
   ...(payload?{headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:{})
  });
  let data={};try{data=await response.json()}catch{}
  if(!response.ok)throw Error(data.error||'Unable to update your alert settings.');
  return data;
 }
 function configureState(settings){
  snapshot=settings;
  const connectedCount=Number(settings.emailEnabled)+Number(settings.discordConnected)+Number(settings.telegramConnected);
  const online=!!settings.deliveryOnline;
  const status=$('alert-member-status');
  status.textContent=online?(connectedCount?connectedCount+' ALERT CHANNEL'+(connectedCount===1?'':'S')+' ON':'CHOOSE YOUR ALERT CHANNELS'):
   'DELIVERY SETUP PENDING';
  status.classList.toggle('offline',!online);
  $('alert-feature-tier').textContent=connectedCount?'◆ MEMBER ALERTS ACTIVE':'◆ MEMBER FEATURE';
  const email=$('alert-email-enabled');
  email.checked=!!settings.emailEnabled;
  email.disabled=!settings.available.email&&!settings.emailEnabled;
  $('alert-email-status').textContent=!settings.available.email?'Email delivery setup pending':
   settings.emailEnabled?'Active · your membership email':'Off · enable to receive alerts';
  $('alert-email-card').classList.toggle('enabled',!!settings.emailEnabled);
  $('alert-email-test').disabled=!(settings.emailEnabled&&settings.available.email);
  $('alert-discord-label').textContent=settings.discordConnected?'Discord connected':'Not connected';
  $('alert-discord-status').textContent=!settings.available.discord?'Discord delivery setup pending':
   settings.discordConnected?'New signals will post to your channel':'Connect a private Discord channel';
  $('alert-discord-card').classList.toggle('enabled',!!settings.discordConnected);
  $('alert-discord-connect').textContent=settings.discordConnected?'Change webhook':'Connect Discord';
  $('alert-discord-connect').disabled=!settings.available.discord;
  $('alert-discord-test').hidden=!settings.discordConnected;
  $('alert-discord-remove').hidden=!settings.discordConnected;
  $('alert-discord-dot').classList.toggle('on',!!settings.discordConnected);
  $('alert-telegram-label').textContent=settings.telegramConnected?'Telegram connected':'Not connected';
  $('alert-telegram-status').textContent=!settings.available.telegram?'Telegram bot setup pending':
   settings.telegramConnected?'Private notifications enabled':'Connect to your Gold alert bot';
  $('alert-telegram-card').classList.toggle('enabled',!!settings.telegramConnected);
  $('alert-telegram-connect').textContent=settings.telegramConnected?'Change Telegram':'Connect Telegram ↗';
  $('alert-telegram-connect').disabled=!settings.available.telegram;
  $('alert-telegram-test').hidden=!settings.telegramConnected;
  $('alert-telegram-remove').hidden=!settings.telegramConnected;
  $('alert-telegram-dot').classList.toggle('on',!!settings.telegramConnected);
  if(settings.telegramConnected){
   pendingTelegram=false;$('alert-telegram-link').hidden=true;
  }
  $('alert-member-expiry').textContent=expiresAt?'Membership active until '+timeText(expiresAt):'';
 }
 function setMember(enabled,expiry){
  const changed=enabled!==active;
  active=!!enabled;expiresAt=expiry||null;
  $('alert-locked').hidden=active;
  $('alert-member').hidden=!active;
  $('alert-feature-tier').textContent=active?'◆ MEMBER FEATURE':'◆ MEMBERS ONLY';
  if(!active){
   snapshot=null;pendingTelegram=false;
   $('alert-feedback').hidden=true;
  }else if(changed){loadSettings()}
  else if(snapshot)$('alert-member-expiry').textContent=expiresAt?'Membership active until '+timeText(expiresAt):'';
 }
 async function loadSettings(){
  if(!active||requesting)return;
  requesting=true;
  try{
   const result=await api('GET');
   configureState(result);lastLoaded=Date.now();
  }catch(error){feedback(error.message,true)}
  finally{requesting=false}
 }
 async function update(body,{message='Settings saved',test=false}={}){
  if(!active||requesting)return;
  requesting=true;
  try{
   const result=await api('POST',body);
   if(result.telegramUrl){
    const url=new URL(result.telegramUrl);
    if(url.protocol!=='https:'||url.hostname!=='t.me')throw Error('Invalid Telegram connection link');
    const el=$('alert-telegram-link');el.replaceChildren();
    el.append('Open Telegram and tap Start to activate your alert bot. ');
    const link=document.createElement('a');link.href=url.toString();link.target='_blank';link.rel='noopener noreferrer';
    link.textContent='Open your Telegram bot ↗';el.append(link);el.hidden=false;
    pendingTelegram=true;feedback('Your Telegram connection link is ready. Open it and tap Start.');
   }else if(test)feedback(result.message||'Test notification sent.');
   else{configureState(result);feedback(message)}
  }catch(error){feedback(error.message,true)}
  finally{requesting=false}
 }
 $('alert-email-enabled').addEventListener('change',async event=>{
  const enabled=event.currentTarget.checked;
  await update({action:'email',enabled},{message:enabled?'Email alerts activated.':'Email alerts turned off.'});
  if(snapshot)$('alert-email-enabled').checked=snapshot.emailEnabled;
 });
 $('alert-discord-connect').addEventListener('click',()=>{
  const form=$('alert-discord-form');
  form.hidden=false;
  $('alert-discord-url').focus();
 });
 $('alert-discord-cancel').addEventListener('click',()=>{
  $('alert-discord-form').hidden=true;$('alert-discord-url').value='';
 });
 $('alert-discord-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const hook=$('alert-discord-url').value.trim();
  if(!hook)return feedback('Paste the Discord webhook URL.',true);
  await update({action:'discord',webhook:hook},{message:'Discord connected. Your BUY, SELL and EXIT alerts will arrive in this channel.'});
  if(snapshot?.discordConnected){$('alert-discord-form').hidden=true;$('alert-discord-url').value=''}
 });
 $('alert-discord-remove').addEventListener('click',async()=>{
  await update({action:'discord',webhook:''},{message:'Discord channel disconnected.'});
  $('alert-discord-form').hidden=true;$('alert-discord-url').value='';
 });
 $('alert-telegram-connect').addEventListener('click',async()=>{
  await update({action:'telegram-link'});
 });
 $('alert-telegram-remove').addEventListener('click',async()=>{
  await update({action:'telegram-remove'},{message:'Telegram notifications disconnected.'});
 });
 for(const channel of ['email','discord','telegram']){
  $('alert-'+channel+'-test').addEventListener('click',async()=>{
   await update({action:'test',channel},{test:true});
  });
 }
 window.addEventListener('gold:member-access',event=>{
  setMember(!!event.detail?.active,event.detail?.expiresAt);
 });
 window.addEventListener('focus',()=>{
  if(active&&(pendingTelegram||Date.now()-lastLoaded>60000))loadSettings();
 });
 // Poll Telegram connection status only when someone has initiated setup.
 setInterval(()=>{if(active&&pendingTelegram)loadSettings()},15000);
 // Refresh delivery-worker heartbeat without requesting while signed out.
 setInterval(()=>{if(active&&!pendingTelegram&&Date.now()-lastLoaded>120000)loadSettings()},120000);
})();
