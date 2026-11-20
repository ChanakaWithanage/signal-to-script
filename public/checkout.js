// Each buyer receives an embedded NOWPayments widget for their own tracked invoice.
const NAMES={
 'gold-breakout-15m':'Gold Breakout 15M Strategy',
 'supertrend-dema-reversal':'Supertrend + DEMA Reversal Strategy'
};
const params=new URLSearchParams(location.search);
const initialSlug=String(params.get('script')||'').trim().toLowerCase();
const productSelect=document.getElementById('premium-script');
const coinSelect=document.getElementById('premium-payment-choice');
const NEW_PRICE_USD='12.49';
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
const storageKey=()=> 'sts_nowpayments_order_'+slug;
const paypalKey=()=> 'sts_paypal_order_'+slug;
const paypalStart=document.getElementById('premium-paypal-start');
const paypalAvailability=document.getElementById('premium-paypal-availability');
const paypalPanel=document.getElementById('premium-paypal-order');
const paypalMessage=document.getElementById('premium-paypal-message');
const paypalCheck=document.getElementById('premium-paypal-check');
const paypalDownload=document.getElementById('premium-paypal-download');
let paypalOrder=null;
let order=null,checking=false;
const setMessage=value=>{message.textContent=value};
async function paypalApi(action,extra={}){
 const res=await fetch('/api/paypal',{method:'POST',credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action,...extra})});
 if(action==='download'){
  if(res.ok)return res;
  const b=await res.json().catch(()=>({}));
  throw Error(b.error||'Could not download the purchased file.');
 }
 const b=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(b.error||'PayPal checkout is unavailable.');
 return b;
}
function loadPaypalOrder(){
 try{
  const record=JSON.parse(localStorage.getItem(paypalKey())||'null');
  return record&&record.slug===slug&&/^[a-f0-9]{24}$/.test(record.id)&&
   /^[a-f0-9]{64}$/.test(record.secret)?record:null;
 }catch{return null}
}
function savePaypalOrder(record){
 paypalOrder=record;
 try{localStorage.setItem(paypalKey(),JSON.stringify(record))}catch{}
}
function renderPaypal(){
 paypalOrder=loadPaypalOrder();
 paypalPanel.hidden=!paypalOrder;
 if(!paypalOrder)return;
 const paid=paypalOrder.status==='paid';
 paypalMessage.textContent=paid?'PayPal payment confirmed. Your Pine Script is ready to download.':
  'Your PayPal checkout has been started. Return here after approving payment.';
 paypalDownload.hidden=!paid;
 paypalCheck.hidden=paid;
}
async function checkPaypalPayment(){
 if(!paypalOrder)return;
 paypalCheck.disabled=true;
 try{
  const action=paypalOrder.status==='paid'?'status':'capture';
  const result=await paypalApi(action,{id:paypalOrder.id,secret:paypalOrder.secret,
   paypalOrderId:paypalOrder.paypalOrderId});
  savePaypalOrder({...paypalOrder,...result.order});
  renderPaypal();
 }catch(e){paypalMessage.textContent=e.message}
 finally{paypalCheck.disabled=false}
}
async function handlePaypalReturn(){
 const qs=new URLSearchParams(location.search);
 const token=qs.get('token');
 if(!qs.has('paypal_return'))return;
 const record=loadPaypalOrder();
 if(!record||!token||token!==record.paypalOrderId){
  paypalAvailability.textContent='Could not match your PayPal return to an order in this browser. Contact support with your PayPal receipt.';
  return;
 }
 paypalPanel.hidden=false;
 paypalMessage.textContent='Checking your PayPal payment...';
 try{
  const result=await paypalApi('capture',{id:record.id,secret:record.secret,paypalOrderId:token});
  savePaypalOrder({...record,...result.order});
  renderPaypal();
  if(result.order?.status==='paid')paypalDownload.focus();
  const clean=new URL(location.href);
  clean.searchParams.delete('paypal_return');clean.searchParams.delete('token');clean.searchParams.delete('PayerID');
  history.replaceState(null,'',clean.pathname+clean.search);
 }catch(e){paypalMessage.textContent=e.message+' You can check the payment status here.'}
}
paypalStart.addEventListener('click',async()=>{
 const selected=String(productSelect.value||'').toLowerCase();
 if(!Object.hasOwn(NAMES,selected))return;
 paypalStart.disabled=true;
 paypalAvailability.textContent='Preparing your PayPal checkout...';
 try{
  const response=await paypalApi('create',{slug:selected,sessionId:buyerSessionId,browserTimezone});
  savePaypalOrder(response.order);
  location.assign(response.approvalUrl);
 }catch(e){paypalAvailability.textContent=e.message;paypalStart.disabled=false}
});
paypalCheck.addEventListener('click',()=>checkPaypalPayment());
paypalDownload.addEventListener('click',async()=>{
 if(!paypalOrder)return;
 paypalDownload.disabled=true;
 try{
  const res=await paypalApi('download',{id:paypalOrder.id,secret:paypalOrder.secret});
  const blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=paypalOrder.slug+'.pine';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
  paypalMessage.textContent='Download started. Thank you for your purchase.';
 }catch(e){paypalMessage.textContent=e.message}
 finally{paypalDownload.disabled=false}
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
  const saved=JSON.parse(localStorage.getItem(storageKey())||'null');
  if(saved?.slug===slug&&/^[a-f0-9]{24}$/.test(saved.id)&&/^[a-f0-9]{64}$/.test(saved.secret))
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
  availability.textContent='This order uses an earlier price. Start a new checkout for the current $12.49 offer.';
  setMessage('If you already paid for this order, you can still check its payment status here.');
  return;
 }
 if(order.status==='paid'){
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
 history.replaceState(null,'','/checkout.html?script='+encodeURIComponent(slug));
 title.textContent=NAMES[slug];
 order=restoreOrder();
 newOrder.hidden=!!order;orderPanel.hidden=!order;
 renderPaypal();
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
 title.textContent=NAMES[slug];
 reserve.disabled=true;
 try{
  const response=await fetch('/api/premium',{cache:'no-store'});
  if(!response.ok)throw Error('Checkout availability cannot be verified.');
  const state=await response.json();
  const canPayPal=Boolean(state.paypalReady&&state.offerActive);
  paypalStart.disabled=!canPayPal;
  paypalAvailability.textContent=canPayPal?
   'PayPal checkout opens securely on PayPal, then returns here for your download.':
   'PayPal is being set up. Crypto checkout remains available.';
  renderPaypal();
  const recovered=restoreOrder();
  if(recovered){
   saveOrder(recovered);
   display();
   await refresh(true);
   return;
  }
  newOrder.hidden=false;orderPanel.hidden=true;
  if(!state.offerActive){
   newOrder.hidden=true;
   availability.textContent='The early Black Friday promotion ended. New orders are paused.';
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
loadAvailability();
handlePaypalReturn();
