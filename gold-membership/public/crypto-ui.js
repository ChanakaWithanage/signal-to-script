(()=>{
'use strict';
const $=id=>document.getElementById(id),key='gold_crypto_pending_v1';
const dialog=document.createElement('dialog');dialog.className='crypto-checkout-modal';dialog.id='crypto-checkout-dialog';
dialog.innerHTML=[
'<button class="crypto-x" type="button" aria-label="Close crypto checkout">×</button>',
'<div class="crypto-icon">₿</div><span class="kicker">VIP MEMBERSHIP · CRYPTO CHECKOUT</span>',
'<h2>Pay securely with crypto</h2><p class="crypto-lead">Complete NOWPayments checkout to activate VIP membership after your payment is confirmed.</p>',
'<div id="crypto-form-wrap"><form id="crypto-buy-form">',
'<label for="crypto-plan">Membership</label><select id="crypto-plan" required><option value="weekly">Weekly · 7 days · $4.99</option><option value="monthly">Monthly · 30 days · $14.99</option><option value="yearly">Yearly · 365 days · $89.99</option></select>',
'<label for="crypto-email">Membership email</label><input type="email" id="crypto-email" required maxlength="254" placeholder="you@example.com" autocomplete="email">',
'<label for="crypto-coin">Cryptocurrency</label><select id="crypto-coin"><option value="usdtbsc">USDT · BSC (BEP20)</option><option value="usdttrc20">USDT · TRON (TRC20)</option><option value="ltc">Litecoin (LTC)</option><option value="trx">Tron (TRX)</option><option value="auto">Choose coin on NOWPayments</option></select>',
'<button type="submit" class="btn gold wide" id="crypto-pay">Continue to NOWPayments ↗</button></form>',
'<p class="crypto-detail">Network minimums vary. If your plan is below the minimum, choose another coin or request manual payment.</p></div>',
'<div id="crypto-status-wrap" hidden><strong id="crypto-status-title">Checking your payment…</strong>',
'<p id="crypto-status-copy">Your VIP code is issued when payment is verified.</p>',
'<div id="crypto-access" hidden><label>VIP access code</label><code id="crypto-access-code"></code>',
'<button class="btn ghost" id="crypto-copy-code" type="button">Copy code</button><p id="crypto-access-expiry"></p>',
'<a class="btn gold wide" href="/?login=1" id="crypto-go-login">Open VIP member login ↗</a></div>',
'<a id="crypto-invoice-link" class="btn ghost wide" target="_blank" rel="noopener noreferrer" hidden>Resume payment ↗</a>',
'<button id="crypto-recheck" class="btn ghost wide" type="button">Check payment again ↻</button></div>',
'<p role="status" id="crypto-feedback" aria-live="polite"></p>',
'<button type="button" class="crypto-manual">Prefer manual payment? Request access instead</button>'
].join('');
document.body.append(dialog);
const form=$('crypto-buy-form'),pay=$('crypto-pay');
const feedback=(msg,error=false)=>{$('crypto-feedback').textContent=msg;$('crypto-feedback').classList.toggle('error',error)};
const pending=()=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
function save(x){try{localStorage.setItem(key,JSON.stringify(x))}catch{}}
function clear(){try{localStorage.removeItem(key)}catch{}}
function open(plan='weekly'){
 if(['weekly','monthly','yearly'].includes(plan))$('crypto-plan').value=plan;
 $('crypto-form-wrap').hidden=false;$('crypto-status-wrap').hidden=true;
 feedback('');if(!dialog.open)dialog.showModal();
}
function showStatus(){$('crypto-form-wrap').hidden=true;$('crypto-status-wrap').hidden=false;if(!dialog.open)dialog.showModal()}
function validInvoice(raw){
 try{const u=new URL(raw);return u.protocol==='https:'&&(u.hostname==='nowpayments.io'||u.hostname.endsWith('.nowpayments.io'))?u.href:null}catch{return null}
}
function linkInvoice(raw){const u=validInvoice(raw);$('crypto-invoice-link').hidden=!u;if(u)$('crypto-invoice-link').href=u}
let polling=false,timer=null;
async function check(){
 const order=pending();if(!order?.id||!order?.secret||polling)return;
 polling=true;
 try{
  const res=await fetch('/api/crypto',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'check',id:order.id,secret:order.secret})});
  const data=await res.json();if(!res.ok)throw Error(data.error||'Unable to check payment');
  const value=data.order;if(!value)return;
  if(value.status==='active'){
   if(timer)clearInterval(timer);
   $('crypto-status-title').textContent='🎉 Your VIP membership is active!';
   $('crypto-status-copy').textContent='Payment confirmed. Your access code is ready. We also email it when email delivery is configured.';
   $('crypto-access').hidden=false;$('crypto-access-code').textContent=value.accessCode||'Check your email';
   $('crypto-access-expiry').textContent=value.expiresAt?'Active until '+new Date(value.expiresAt).toLocaleDateString():'';
   clear();feedback('');
  }else if(value.status==='failed'){
   $('crypto-status-title').textContent='Payment unavailable';
   $('crypto-status-copy').textContent='Contact support or use manual payment.';
   clear();
  }else{
   $('crypto-status-title').textContent='Waiting for payment confirmation…';
   $('crypto-status-copy').textContent='NOWPayments will verify your transfer. Your VIP code appears here when confirmed. Return on this browser to check again.';
   linkInvoice(value.invoiceUrl||order.invoiceUrl);
  }
 }catch(e){feedback(e.message,true)}finally{polling=false}
}
function showPending(){
 if(!pending())return;
 showStatus();check();
 if(timer)clearInterval(timer);
 timer=setInterval(()=>{if(!document.hidden&&pending())check();else if(!pending()){clearInterval(timer);timer=null}},12000);
}
form.addEventListener('submit',async e=>{
 e.preventDefault();pay.disabled=true;feedback('');
 try{
  const res=await fetch('/api/crypto',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({plan:$('crypto-plan').value,email:$('crypto-email').value.trim(),coin:$('crypto-coin').value})});
  const data=await res.json();if(!res.ok)throw Error(data.error||'Unable to create a payment');
  if(!data.order?.id||!data.order?.secret||!validInvoice(data.order.invoiceUrl))throw Error('Checkout destination unavailable.');
  save(data.order);
  location.assign(validInvoice(data.order.invoiceUrl));
 }catch(e){feedback(e.message,true)}
 finally{pay.disabled=false}
});
document.querySelectorAll('.js-crypto').forEach(button=>button.addEventListener('click',e=>{e.preventDefault();open(button.dataset.plan||'weekly')}));
dialog.querySelector('.crypto-x').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
dialog.querySelector('.crypto-manual').addEventListener('click',()=>{
 const p=$('crypto-plan').value;dialog.close();
 const btn=document.querySelector('.js-plan[data-plan="'+p+'"]');
 if(btn)btn.click();else location.href='/?plan='+encodeURIComponent(p);
});
$('crypto-copy-code').addEventListener('click',()=>navigator.clipboard?.writeText($('crypto-access-code').textContent||''));
$('crypto-recheck').addEventListener('click',check);
const url=new URL(location.href);
if(url.searchParams.has('crypto')){
 url.searchParams.delete('crypto');history.replaceState(null,'',url.pathname+url.search+url.hash);
 if(pending())showPending();
}else if(pending()&&location.pathname==='/')showPending();
if(url.searchParams.get('pay')==='crypto'){
 const plan=url.searchParams.get('plan')||'weekly';
 url.searchParams.delete('pay');history.replaceState(null,'',url.pathname+url.search+url.hash);
 open(plan);
}
})();
