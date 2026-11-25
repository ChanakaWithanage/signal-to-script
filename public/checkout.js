// Each buyer receives an embedded NOWPayments widget for their own tracked invoice.
const NAMES={
 'portfolio-trend-dashboard':'Portfolio Trend Dashboard',
 'gold-breakout-15m':'Gold Breakout 15M Strategy',
 'supertrend-dema-reversal':'Supertrend + DEMA Reversal Strategy',
 'sp500-opening-range-breakout-15m':'S&P 500 Opening Range Breakout 15M'
};
const params=new URLSearchParams(location.search);
const initialSlug=String(params.get('script')||'').trim().toLowerCase();
const productSelect=document.getElementById('premium-script');
const manualForm=document.getElementById('premium-manual-form');
const manualEmail=document.getElementById('premium-manual-email');
const manualSubmit=document.getElementById('premium-manual-submit');
const manualMessage=document.getElementById('premium-manual-message');
const manualStatus=document.getElementById('premium-manual-status');
const manualSuccess=document.getElementById('premium-manual-success');
const manualConfirmedEmail=document.getElementById('premium-manual-confirmed-email');
const manualReference=document.getElementById('premium-manual-reference');
const manualWebsite=document.getElementById('premium-manual-website');
function updateManualRequest(){
 const selected=Object.hasOwn(NAMES,productSelect.value)?productSelect.value:'gold-breakout-15m';
 manualMessage.textContent='I would like lifetime access for $4.99 USD. Please email me the payment instructions.';
 manualSuccess.hidden=true;
 manualForm.hidden=false;
 manualStatus.textContent='';
}

const coinSelect=document.getElementById('premium-payment-choice');
const NEW_PRICE_USD='12.99';
const buyerSessionId=(()=>{
 try{
  let id=sessionStorage.getItem('sts_checkout_session');
  if(!id){id=crypto.randomUUID();sessionStorage.setItem('sts_checkout_session',id)}
  return id;
 }catch{return crypto.randomUUID()}
})();
const browserTimezone=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch{return ''}})();
let slug=Object.hasOwn(NAMES,initialSlug)?initialSlug:'gold-breakout-15m';
productSelect.value=slug;
const title=document.getElementById('premium-product-name');
const availability=document.getElementById('premium-availability');
const reserve=document.getElementById('premium-reserve');
const newOrder=document.getElementById('premium-new-order');
const orderPanel=document.getElementById('premium-order');
const widgetContainer=document.getElementById('premium-widget-container');
const paymentWidget=document.getElementById('premium-payment-widget');
const message=document.getElementById('premium-message');
const check=document.getElementById('premium-check');
const restart=document.getElementById('premium-restart');
const payLink=document.getElementById('premium-pay-link');
const download=document.getElementById('premium-download');
const storageKey=()=> order?.slug==='lifetime'?'sts_lifetime_invoice':'sts_nowpayments_order_'+slug;
let order=null,checking=false;
const setMessage=value=>{message.textContent=value};
manualForm.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!manualForm.reportValidity())return;
 const requestedSlug=String(productSelect.value||'');
 if(!Object.hasOwn(NAMES,requestedSlug)){
  manualStatus.textContent='Please select a Pine Script.';
  return;
 }
 manualSubmit.disabled=true;
 manualSubmit.textContent='Sending your request...';
 manualStatus.textContent='';
 const submittedEmail=manualEmail.value.trim();
 try{
  const response=await fetch('/api/manual-request',{
   method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({
    slug:requestedSlug,email:submittedEmail,website:manualWebsite.value,
    sessionId:buyerSessionId,browserTimezone
   })
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.received)
   throw Error(result.error||'Could not send your request. Please try again.');
  manualForm.hidden=true;
  manualSuccess.hidden=false;
  manualConfirmedEmail.textContent=submittedEmail;
  if(result.secret)rememberMembership({id:result.requestId,secret:result.secret,method:'manual'});
  manualReference.textContent=result.requestId?'Request ID: '+result.requestId:'';
  manualStatus.textContent='';
 }catch(error){
  manualStatus.textContent=error.message;
 }finally{
  manualSubmit.disabled=false;
  manualSubmit.textContent='Request lifetime access · $4.99';
 }
});
async function api(action,extra={}){
 const response=await fetch('/api/premium',{
  method:'POST',credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action,...extra})
 });
 if(action==='download'){
  if(response.ok)return response;
  const body=await response.json().catch(()=>({}));
  throw Error(body.error||'Unable to download right now.');
 }
 const body=await response.json();
 if(!response.ok)throw Error(body.error||'Crypto checkout is temporarily unavailable.');
 return body;
}
function saveOrder(next){
 order=next;
 try{localStorage.setItem(storageKey(),JSON.stringify(next))}catch{}
}
function restoreOrder(){
 try{
  const saved=JSON.parse(localStorage.getItem('sts_lifetime_invoice')||localStorage.getItem('sts_nowpayments_order_'+slug)||'null');
  if((saved?.slug==='lifetime'||saved?.slug===slug)&&/^[a-f0-9]{24}$/.test(saved.id)&&/^[a-f0-9]{64}$/.test(saved.secret))
   return saved;
 }catch{}
 return null;
}
function display(){
 if(!order)return;
 document.getElementById('premium-exact-amount').textContent='$'+order.amountUsd+' USD';
 const oldPending=order.status!=='paid'&&Number(order.amountUsd)!==Number(NEW_PRICE_USD);
 document.getElementById('premium-pay-coin').textContent='Select your coin and network below';
 document.getElementById('premium-order-id').textContent=order.id;
 newOrder.hidden=true;orderPanel.hidden=false;
 if(oldPending){
  widgetContainer.hidden=true;payLink.hidden=true;check.hidden=false;restart.hidden=false;download.hidden=true;
  availability.textContent='This order uses an earlier price. Start a new checkout for the current $12.99 offer.';
  setMessage('If you already paid for this order, you can still check its payment status here.');
  return;
 }
 if(order.status==='paid'){
  if(order.slug==='lifetime'){rememberMembership({id:order.id,secret:order.secret,method:'crypto'});return;}
  widgetContainer.hidden=true;payLink.hidden=true;check.hidden=true;restart.hidden=true;download.hidden=false;
  availability.textContent='Payment confirmed! Your premium source is ready.';
  setMessage('Thank you for your purchase. Download your Pine Script below.');
 }else if(order.status==='failed'){
  widgetContainer.hidden=true;payLink.hidden=true;check.hidden=true;restart.hidden=false;download.hidden=true;
  availability.textContent='This checkout could not be completed. Please contact support.';
 }else{
  const invoiceId=String(order.invoiceId||'');
  if(/^[0-9]{3,25}$/.test(invoiceId)){
   const widgetUrl='https://nowpayments.io/embeds/payment-widget?iid='+invoiceId;
   if(paymentWidget.getAttribute('src')!==widgetUrl)paymentWidget.setAttribute('src',widgetUrl);
   widgetContainer.hidden=false;
  }else{widgetContainer.hidden=true;}
  if(order.invoiceUrl){
   payLink.href=order.invoiceUrl;
   payLink.hidden=false;
  }else{payLink.hidden=true;}
  download.hidden=true;check.hidden=false;restart.hidden=false;
  availability.textContent='Your secure NOWPayments checkout is ready.';
  setMessage('Choose your payment option in the widget. Your download will unlock here after confirmation.');
 }
}
productSelect.addEventListener('change',()=>{
 if(!Object.hasOwn(NAMES,productSelect.value))return;
 slug=productSelect.value;
 history.replaceState(null,'','/checkout?script='+encodeURIComponent(slug));
 
 updateManualRequest();
 order=restoreOrder();
 newOrder.hidden=!!order;orderPanel.hidden=!order;
 if(order){display();refresh(true)}else{setMessage('');loadAvailability()}
});
async function refresh(silent=false){
 if(!order||checking||order.status==='paid')return;
 checking=true;check.disabled=true;
 const checkingId=order.id;
 if(!silent)setMessage('Checking your order status...');
 try{
  const result=await api('check',{id:order.id,secret:order.secret});
  if(!order||order.id!==checkingId)return;
  const updated=result.order;
  if(updated?.status==='paid'){
   saveOrder({...order,...updated});
   display();
   download.focus();
  }else if(updated?.status==='failed'){
   saveOrder({...order,...updated});
   display();
  }else if(updated?.invoiceId&&!order.invoiceId){
   saveOrder({...order,...updated});
   display();
  }else if(!silent){
   setMessage('No completed payment yet. NOWPayments may need additional blockchain confirmations.');
  }
 }catch(error){if(!silent)setMessage(error.message)}
 finally{checking=false;check.disabled=false}
}
reserve.addEventListener('click',async()=>{
 slug=String(productSelect.value||'').trim().toLowerCase();
 if(!Object.hasOwn(NAMES,slug)){
  setMessage('Please choose a Pine Script.');return;
 }
 reserve.disabled=true;
 const preferredCurrency=String(coinSelect.value||'usdtbsc').trim().toLowerCase();
 if(!['usdtbsc','usdttrc20','auto'].includes(preferredCurrency)){
  setMessage('Please select a supported payment option.');return;
 }
 setMessage('Preparing your secure NOWPayments widget...');
 try{
  const result=await api('create',{slug,currency:preferredCurrency,sessionId:buyerSessionId,browserTimezone});
  saveOrder(result.order);
  display();
 }catch(error){
  reserve.disabled=false;
  setMessage(error.message);
 }
});
check.addEventListener('click',()=>refresh(false));
restart.addEventListener('click',()=>{
 if(order){
  try{
   localStorage.setItem('sts_nowpayments_previous_'+order.id,JSON.stringify(order));
   localStorage.removeItem(storageKey());
  }catch{}
 }
 order=null;
 paymentWidget.removeAttribute('src');
 widgetContainer.hidden=true;
 payLink.hidden=true;
 restart.hidden=true;
 orderPanel.hidden=true;
 newOrder.hidden=false;
 setMessage('');
 loadAvailability();
});
download.addEventListener('click',async()=>{
 if(!order)return;
 download.disabled=true;
 setMessage('Preparing your purchased script...');
 try{
  const response=await api('download',{id:order.id,secret:order.secret});
  const blob=await response.blob(),url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download=slug+'.pine';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
  setMessage('Download started. This browser remembers your purchased order.');
 }catch(error){setMessage(error.message)}
 finally{download.disabled=false}
});
setInterval(()=>{if(order&&order.status==='pending')refresh(true)},20000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&order)refresh(true)});
async function loadAvailability(){
 
 reserve.disabled=true;
 try{
  const response=await fetch('/api/premium',{cache:'no-store'});
  if(!response.ok)throw Error('Checkout availability cannot be verified.');
  const state=await response.json();
  const recovered=restoreOrder();
  if(recovered){
   saveOrder(recovered);
   display();
   await refresh(true);
   return;
  }
  newOrder.hidden=false;orderPanel.hidden=true;
  if(!state.offerActive){
   manualForm.hidden=true;
   manualStatus.textContent='This launch offer is no longer available.';
   newOrder.hidden=true;
   availability.textContent='The introductory membership offer is no longer available. New orders are paused.';
   return;
  }
  if(!state.ready?.[slug]){
   reserve.disabled=true;
   availability.textContent='Crypto checkout is being configured. Do not send a payment yet.';
   return;
  }
  availability.textContent='Ready for secure payment. USDT on BNB Smart Chain is recommended.';
  reserve.disabled=false;
 }catch(error){
  availability.textContent='Checkout is temporarily unavailable. Do not send a payment.';
 }
}
updateManualRequest();
loadAvailability();

let membership=null;
let catalog={};
const memberBox=document.getElementById('member-library');
const memberStatus=document.getElementById('member-status');
const memberFiles=document.getElementById('member-files');
function rememberMembership(receipt){
 membership=receipt;
 try{localStorage.setItem('sts_member_receipt',JSON.stringify(receipt))}catch{}
 const link=new URL('/checkout',location.origin);
 link.hash=new URLSearchParams(receipt).toString();
 document.getElementById('member-bookmark').href=link.href;
 memberBox.hidden=false;
 showMembership().catch(error=>{memberStatus.textContent=error.message});
}
async function showMembership(){
 const receipt=membership;
 const status=await api('check',receipt);
 if(membership!==receipt)return;
 if(status.order.slug!=='lifetime')throw Error('This receipt is for a single script.');
 if(status.order.status!=='paid'){
  memberStatus.textContent='Request received. Your downloads will appear here after payment is confirmed.';
  return;
 }
 const state=await fetch('/api/premium',{cache:'no-store'}).then(response=>response.json());
 catalog={...state.products,...state.freeScripts};
 memberStatus.textContent='Your lifetime pass is active. Choose a script to download.';
 for(const id of ['manual-script-request','premium-crypto-details','premium-order'])document.getElementById(id).hidden=true;
 document.querySelector('.premium-payment-divider').hidden=true;
 document.getElementById('checkout-title').textContent='Member downloads';
 memberFiles.replaceChildren();
 for(const [key,name] of Object.entries(catalog)){
  const button=document.createElement('button');
  button.className='premium-copy-button';button.textContent='Download '+name;
  button.addEventListener('click',async()=>{
   button.disabled=true;
   try{
    const response=await api('download',{...receipt,slug:key});
    const url=URL.createObjectURL(await response.blob());
    const link=document.createElement('a');link.href=url;link.download=key+'.pine';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
   }catch(error){memberStatus.textContent=error.message}finally{button.disabled=false}
  });
  memberFiles.append(button);
 }
}
try{
 const fragment=new URLSearchParams(location.hash.slice(1));
 const receipt=fragment.has('secret')?Object.fromEntries(fragment):JSON.parse(localStorage.getItem('sts_member_receipt')||'null');
 if(receipt&&['crypto','manual'].includes(receipt.method)&&/^[a-f0-9-]{24,36}$/.test(receipt.id)&&/^[a-f0-9]{64}$/.test(receipt.secret)){
  rememberMembership({method:receipt.method,id:receipt.id,secret:receipt.secret});
  if(fragment.has('secret'))history.replaceState(null,'',location.pathname+location.search);
 }
}catch{}
setInterval(()=>{if(membership?.method==='manual'&&!document.hidden&&!memberFiles.childElementCount)showMembership().catch(error=>{memberStatus.textContent=error.message})},20000);
