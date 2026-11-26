/* Site-wide Gold Room launch promotion. The old free Gold signup is retired. */
(()=>{
 'use strict';
 if(window.__stsGlobalGoldOffer)return;
 window.__stsGlobalGoldOffer=true;
 const OFFER_URL='https://gold.signaltoscript.com/pricing.html';
 const FIRST_PROMPT_MS=30000;
 const REPEAT_PROMPT_MS=120000;
 const NEXT_DUE_KEY='sts_gold_room_offer_next_due_v2';
 const CLICKED_KEY='sts_gold_room_offer_clicked_v2';
 let dialog=null,nextDue=0;
 const readKey=key=>{try{return sessionStorage.getItem(key)}catch{return null}};
 const writeKey=(key,value)=>{try{sessionStorage.setItem(key,String(value))}catch{}};
 if(readKey(CLICKED_KEY)==='1')return;
 nextDue=Number(readKey(NEXT_DUE_KEY))||Date.now()+FIRST_PROMPT_MS;
 writeKey(NEXT_DUE_KEY,nextDue);
 if(/^\/trial(?:\.html)?\/?$/.test(location.pathname))return;
 const style=document.createElement('link');
 style.rel='stylesheet';style.href='/site-trial-prompt.css?v=20261126-black-friday';
 document.head.append(style);
 function setNext(){nextDue=Date.now()+REPEAT_PROMPT_MS;writeKey(NEXT_DUE_KEY,nextDue)}
 function create(){
  if(dialog)return dialog;
  dialog=document.createElement('dialog');
  dialog.className='sts-trial-offer sts-gold-launch-offer';
  dialog.setAttribute('aria-labelledby','sts-trial-offer-title');
  dialog.innerHTML=[
   '<button type="button" class="sts-trial-close" aria-label="Close Gold membership offer">×</button>',
   '<span class="sts-trial-kicker">BLACK FRIDAY · 60% OFF</span>',
   '<h2 id="sts-trial-offer-title">Get the next Gold signal before everyone else.</h2>',
   '<p class="sts-trial-description">Real-time Gold BUY, SELL and EXIT alerts delivered directly to email, Discord or Telegram—even when the chart is closed.</p>',
   '<div class="sts-gold-price-box">',
   ' <span>STARTING FROM</span>',
   ' <div class="sts-gold-price-line"><strong>$4.99</strong><del>$12.49</del><b>60% OFF</b></div>',
   ' <small>7 days of Gold signals · Choose weekly, monthly or yearly</small>',
   '</div>',
   '<div class="sts-trial-benefits"><span>✓ Instant member alerts</span><span>✓ Real signal history</span><span>✓ 7 / 30 / 365-day access</span></div>',
   '<a class="sts-trial-primary" href="'+OFFER_URL+'">Unlock Black Friday pricing ↗</a>',
   '<p class="sts-trial-assurance">Weekly $4.99 · Monthly $14.99 · Yearly $89.99</p>',
   '<button type="button" class="sts-trial-later">Keep browsing</button>'
  ].join('');
  document.body.append(dialog);
  dialog.querySelector('.sts-trial-close').addEventListener('click',()=>dialog.close());
  dialog.querySelector('.sts-trial-later').addEventListener('click',()=>dialog.close());
  dialog.querySelector('.sts-trial-primary').addEventListener('click',()=>{
   writeKey(CLICKED_KEY,'1');
  });
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
  dialog.addEventListener('close',setNext);
  return dialog;
 }
 function tick(){
  if(readKey(CLICKED_KEY)==='1'||document.visibilityState!=='visible'||Date.now()<nextDue)return;
  if(Array.from(document.querySelectorAll('dialog[open]')).length)return;
  const offer=create();
  if(offer.open)return;
  offer.showModal();
  setNext();
 }
 setInterval(tick,1000);
})();
