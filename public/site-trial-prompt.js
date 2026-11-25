/* Site-wide Gold alert invitation. Loaded by /site.js on every HTML page. */
(()=>{
'use strict';
if(window.__stsGlobalTrialInvite)return;
window.__stsGlobalTrialInvite=true;
const FIRST_PROMPT_MS=30000;
const REPEAT_PROMPT_MS=120000;
const NEXT_DUE_KEY='sts_sitewide_gold_trial_next_due_v1';
const GOLD_PAGE=/^\/trial(?:\.html)?\/?$/.test(location.pathname);
const fmtMoney=value=>(value>0?'+':'')+new Intl.NumberFormat('en-US',{
 style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:2
}).format(value);
let signedIn=false,authChecked=false,dialog=null,busy=false,opening=false;
function readStoredDue(){
 try{const due=Number(sessionStorage.getItem(NEXT_DUE_KEY));return Number.isFinite(due)&&due>0?due:0}
 catch{return 0}
}
function storeDue(value){
 nextDue=value;
 try{sessionStorage.setItem(NEXT_DUE_KEY,String(value))}catch{}
}
let nextDue=readStoredDue();
if(!nextDue)storeDue(Date.now()+FIRST_PROMPT_MS);
async function getSession(path){
 const response=await fetch(path,{
  credentials:'same-origin',cache:'no-store',
  ...(typeof AbortSignal.timeout==='function'?{signal:AbortSignal.timeout(7000)}:{})
 });
 if(!response.ok)throw Error('Session check unavailable');
 return response.json();
}
async function checkMembership(){
 const results=await Promise.allSettled([
  getSession('/api/trial/session'),getSession('/api/access')
 ]);
 const trial=results[0].status==='fulfilled'?results[0].value:null;
 const google=results[1].status==='fulfilled'?results[1].value:null;
 // Only positive, server-verified sign-ins suppress the offer. An anonymous
 // browser profile is eligible even if an unrelated tab/profile is signed in.
 signedIn=signedIn||trial?.signedIn===true||google?.member===true;
 authChecked=true;
 return signedIn;
}
checkMembership().catch(()=>{authChecked=true});
window.addEventListener('signal-signed-in',()=>{signedIn=true});
window.addEventListener('sts-gold-trial-joined',()=>{signedIn=true});
window.addEventListener('focus',()=>{if(!signedIn)checkMembership().catch(()=>{})});
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible'&&!signedIn)checkMembership().catch(()=>{});
});
function hasOtherOpenDialog(){
 return Array.from(document.querySelectorAll('dialog[open]')).some(item=>item!==dialog);
}
function ensureDialog(){
 if(dialog)return dialog;
 const link=document.createElement('link');
 link.rel='stylesheet';link.href='/site-trial-prompt.css?v=20261125-v1';
 document.head.append(link);
 dialog=document.createElement('dialog');
 dialog.className='sts-trial-offer';
 dialog.setAttribute('aria-labelledby','sts-trial-offer-title');
 dialog.setAttribute('aria-describedby','sts-trial-offer-description');
 dialog.innerHTML=[
 '<button type="button" class="sts-trial-close" aria-label="Close free alerts offer">×</button>',
 '<div class="sts-trial-kicker">FREE GOLD BREAKOUT ALERTS</div>',
 '<h2 id="sts-trial-offer-title">Don\'t miss the next Gold Breakout opportunity.</h2>',
 '<p id="sts-trial-offer-description">Explore the historical results, then get confirmed BUY, SELL and EXIT alerts delivered to your email for free.</p>',
 '<p class="sts-trial-marketing" hidden></p>',
 '<div class="sts-trial-proof" hidden>',
 ' <span class="sts-trial-proof-title">RECENT HISTORICAL RESULTS</span>',
 ' <div class="sts-trial-proof-grid">',
 '  <div><span>Net P&amp;L</span><strong data-stat="profit">–</strong></div>',
 '  <div><span>Winning trades</span><strong data-stat="wins">–</strong></div>',
 '  <div><span>Return</span><strong data-stat="return">–</strong></div>',
 ' </div>',
 ' <small>Based on a $100,000 backtest · 1% risk per trade</small>',
 '</div>',
 '<p class="sts-trial-nudge">Get the next signal without having to watch the Gold chart all day.</p>',
 '<form class="sts-trial-form">',
 ' <label for="sts-trial-email">Email address</label>',
 ' <input id="sts-trial-email" type="email" maxlength="254" autocomplete="email" placeholder="you@example.com" required>',
 ' <input class="sts-trial-honeypot" type="text" name="website" autocomplete="off" tabindex="-1" aria-hidden="true">',
 ' <button type="submit" class="sts-trial-primary">Get my free BUY &amp; SELL alerts →</button>',
 ' <p class="sts-trial-error" role="status" aria-live="polite"></p>',
 '</form>',
 '<p class="sts-trial-returning"><strong>Already joined?</strong> Enter the same email to continue your existing trial.</p>',
 '<p class="sts-trial-assurance">No credit card · No verification step · No subscription</p>',
 '<small class="sts-trial-footnote">Free alerts for seven days from your original signup.</small>',
 '<button type="button" class="sts-trial-later">Continue browsing</button>'
 ].join('');
 document.body.append(dialog);
 dialog.querySelector('.sts-trial-close').addEventListener('click',()=>dialog.close());
 dialog.querySelector('.sts-trial-later').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
 dialog.addEventListener('close',()=>storeDue(Date.now()+REPEAT_PROMPT_MS));
 dialog.querySelector('form').addEventListener('submit',subscribe);
 return dialog;
}
let statsRequest=null;
async function fillHistoricalProof(){
 const offer=ensureDialog();
 if(!statsRequest){
  statsRequest=getSession('/api/trial/data?days=30')
   .catch(error=>{statsRequest=null;throw error});
 }
 let data;
 try{data=await statsRequest}catch{return}
 if(!offer.open||!data||data.preview)return;
 const stats=data.stats,performance=data.performanceUsd;
 if(!(stats?.trades>0&&Number.isFinite(stats.wins)&&
      Number.isFinite(performance?.netUsd)&&Number.isFinite(performance?.returnPercent)))return;
 const profit=performance.netUsd,pct=performance.returnPercent;
 const signedPct=(pct>0?'+':'')+pct.toFixed(2)+'%';
 const winning=stats.wins+' winning '+(stats.wins===1?'trade':'trades');
 const days=Number(data.market?.availableDays||0);
 const period=days>=1?' in '+(days>=7?Math.floor(days):days.toFixed(1))+
  ' days of available Gold history':' in the available Gold backtest';
 const marketing=offer.querySelector('.sts-trial-marketing');
 marketing.textContent=profit>0?
  'Don\'t miss the next signal. This strategy recorded '+fmtMoney(profit)+
   ' historical net profit, a '+signedPct+' return and '+winning+period+
   '. Get future alerts for free.':
  'This strategy recorded '+winning+period+
   ', with '+fmtMoney(profit)+' net P&L ('+signedPct+
   ' return). Get future confirmed BUY, SELL and EXIT alerts for free.';
 marketing.hidden=false;
 const proof=offer.querySelector('.sts-trial-proof');
 proof.hidden=false;
 offer.querySelector('[data-stat="profit"]').textContent=fmtMoney(profit);
 offer.querySelector('[data-stat="wins"]').textContent=String(stats.wins);
 offer.querySelector('[data-stat="return"]').textContent=signedPct;
 for(const id of ['profit','return']){
  const field=offer.querySelector('[data-stat="'+id+'"]');
  field.classList.toggle('sts-positive',profit>0);
  field.classList.toggle('sts-negative',profit<0);
 }
}
async function subscribe(event){
 event.preventDefault();
 if(busy)return;
 const form=event.currentTarget;
 if(!form.reportValidity())return;
 busy=true;
 const button=form.querySelector('button[type="submit"]');
 const error=form.querySelector('.sts-trial-error');
 button.disabled=true;button.textContent='Activating your alerts…';error.textContent='';
 try{
  const response=await fetch('/api/trial/start',{
   method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({
    email:form.querySelector('input[type=email]').value.trim(),
    website:form.querySelector('input[name=website]').value,
    source:'sitewide-gold-offer',
    referrer:document.referrer||'direct',
    timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||null
   })
  });
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Unable to activate alerts. Try again.');
  signedIn=true;
  window.dispatchEvent(new Event('sts-gold-trial-joined'));
  dialog.close();
  location.assign('/trial.html');
 }catch(e){
  error.textContent=e.message||'Please try again.';
 }finally{
  busy=false;button.disabled=false;button.textContent='Get my free BUY & SELL alerts →';
 }
}
function showInvite(){
 if(GOLD_PAGE&&typeof window.SignalGoldTrial?.openSignup==='function'){
  // Reuse the chart's richer, already populated performance signup dialog.
  return window.SignalGoldTrial.openSignup()!==false;
 }
 const offer=ensureDialog();
 if(offer.open)return false;
 offer.showModal();
 fillHistoricalProof();
 return true;
}
const goldModal=document.getElementById('trial-access-dialog');
if(goldModal)goldModal.addEventListener('close',()=>storeDue(Date.now()+REPEAT_PROMPT_MS));
async function tick(){
 if(opening||signedIn||!authChecked||document.visibilityState!=='visible'||
  Date.now()<nextDue||hasOtherOpenDialog())return;
 opening=true;
 try{
  // Confirm the browser still has no trial or Google member session.
  if(await checkMembership())return;
  if(document.visibilityState!=='visible'||hasOtherOpenDialog())return;
  if(showInvite())storeDue(Date.now()+REPEAT_PROMPT_MS);
 }catch(e){console.error('Gold invitation unavailable',e)}
 finally{opening=false}
}
setInterval(tick,1000);
})();