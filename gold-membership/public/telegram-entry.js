// Capture attribution before the membership dialog removes its plan query.
(()=>{
 const params=new URLSearchParams(location.search);
 const valid=new Set(['signal_entry','signal_exit','daily_range','daily_recap','weekly_recap','welcome','channel']);
 const key='gold_public_telegram_source';
 let source=null;
 try{source=sessionStorage.getItem(key)}catch{}
 if(params.get('utm_source')==='telegram'&&params.get('utm_campaign')==='gold_room'){
  const content=params.get('utm_content')||'channel';
  source=valid.has(content)?content:'channel';
  try{sessionStorage.setItem(key,source)}catch{}
 }
 window.GoldTelegramSource=valid.has(source)?source:null;
 // Forward attribution on the standalone pricing page, including browsers
 // where sessionStorage is disabled.
 if(window.GoldTelegramSource){
  for(const anchor of document.querySelectorAll('a[href^="/?plan="],a[href="/"],a[href^="/#"]')){
   const url=new URL(anchor.href,location.origin);
   url.searchParams.set('utm_source','telegram');
   url.searchParams.set('utm_medium','channel');
   url.searchParams.set('utm_campaign','gold_room');
   url.searchParams.set('utm_content',window.GoldTelegramSource);
   anchor.href=url.href;
  }
 }
 const link=document.getElementById('public-telegram-link');
 if(link)fetch('/api/public-channel',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{
  if(typeof data?.username!=='string'||!/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(data.username))return;
  link.href='https://t.me/'+data.username.slice(1);
  link.hidden=false;
 }).catch(()=>{});
})();
