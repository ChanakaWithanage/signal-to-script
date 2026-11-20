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
const paypalSdkArea=document.getElementById('premium-paypal-sdk-area');
const paypalWalletButtons=document.getElementById('premium-paypal-wallet-buttons');
const paypalCardButtons=document.getElementById('premium-paypal-card-buttons');
const paypalCardNote=document.getElementById('premium-paypal-card-note');
const paypalAvailability=document.getElementById('premium-paypal-availability');
const paypalPanel=document.getElementById('premium-paypal-order');
const paypalMessage=document.getElementById('premium-paypal-message');
const paypalCheck=document.getElementById('premium-paypal-check');
const paypalDownload=document.getElementById('premium-paypal-download');
const cryptoDetails=document.getElementById('premium-crypto-details');
let paypalOrder=null,paypalSdkReady=false,paypalSdkLoading=false;
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
function restorePaypalByProviderId(paypalOrderId){
 // Approval windows can remain open while the buyer switches the selected script.
 try{
  for(const product of Object.keys(NAMES)){
   const saved=JSON.parse(localStorage.getItem('sts_paypal_order_'+product)||'null');
   if(saved?.paypalOrderId===paypalOrderId&&saved.slug===product&&
      /^[a-f0-9]{24}$/.test(saved.id)&&/^[a-f0-9]{64}$/.test(saved.secret)){
    if(slug!==product){
     slug=product;productSelect.value=product;
     title.textContent=NAMES[product];
     history.replaceState(null,'','/checkout?script='+encodeURIComponent(product));
     order=restoreOrder();
     if(order){display()}else{newOrder.hidden=false;orderPanel.hidden=true}
    }
    return saved;
   }
  }
 }catch{}
 return null;
}
function savePaypalOrder(record){
 paypalOrder=record;
 try{localStorage.setItem(paypalKey(),JSON.stringify(record))}catch{}
}
function renderPaypal(){
 paypalOrder=loadPaypalOrder();
 const paid=paypalOrder?.status==='paid';
 paypalSdkArea.hidden=!paypalSdkReady||!!paid;
 paypalPanel.hidden=!paypalOrder;
 if(!paypalOrder)return;
 paypalMessage.textContent=paid?
  'PayPal payment confirmed. Your Pine Script is ready to download.':
  'Your PayPal order is pending. Complete the PayPal approval window to finish the purchase.';
 paypalDownload.hidden=!paid;
 paypalCheck.hidden=paid;
}
async function checkPaypalPayment(){
 if(!paypalOrder)return;
 paypalCheck.disabled=true;
 try{
  const result=await paypalApi('status',{id:paypalOrder.id,secret:paypalOrder.secret});
  savePaypalOrder({...paypalOrder,...result.order});
  renderPaypal();
  if(result.order?.status!=='paid')paypalMessage.textContent='Your payment is not yet confirmed. Check the PayPal window or your receipt.';
 }catch(error){paypalMessage.textContent=error.message}
 finally{paypalCheck.disabled=false}
}
async function finalizePaypalPayment(paypalOrderId){
 const saved=restorePaypalByProviderId(paypalOrderId);
 if(!saved)
  throw Error('Could not match the PayPal approval to this browser order. Contact support with your receipt.');
 paypalPanel.hidden=false;
 paypalMessage.textContent='Verifying your approved PayPal payment...';
 const result=await paypalApi('capture',{id:saved.id,secret:saved.secret,paypalOrderId});
 savePaypalOrder({...saved,...result.order});
 renderPaypal();
 if(result.order?.status==='paid'){
  paypalAvailability.textContent='Payment confirmed. Your Pine Script download is ready.';
  paypalDownload.focus();
 }
 return result;
}
async function handlePaypalReturn(){
 // Recovery for legacy hosted-approval links and mobile PayPal app switches.
 const qs=new URLSearchParams(location.search);
 if(qs.has('paypal_cancel')){
  paypalAvailability.textContent='PayPal payment canceled. You can try again below.';
  return;
 }
 if(!qs.has('paypal_return'))return;
 const token=qs.get('token');
 if(!token){
  paypalAvailability.textContent='Your PayPal return did not contain an order reference. Contact support if you paid.';
  return;
 }
 try{
  await finalizePaypalPayment(token);
  const clean=new URL(location.href);
  clean.searchParams.delete('paypal_return');clean.searchParams.delete('token');clean.searchParams.delete('PayerID');
  history.replaceState(null,'',clean.pathname+clean.search);
 }catch(error){paypalAvailability.textContent=error.message}
}
function loadPayPalSdk(clientId){
 return new Promise((resolve,reject)=>{
  if(window.paypal?.Buttons){resolve(window.paypal);return}
  const script=document.createElement('script');
  const query=new URLSearchParams({ 'client-id':clientId,currency:'USD',
   intent:'capture',components:'buttons' });
  script.src='https://www.paypal.com/sdk/js?'+query.toString();
  script.async=true;
  script.onload=()=>window.paypal?.Buttons?resolve(window.paypal):reject(Error('PayPal buttons unavailable.'));
  script.onerror=()=>reject(Error('Unable to load PayPal checkout. Please try again or use crypto.'));
  document.head.appendChild(script);
 });
}
function paypalButtonConfig(fundingSource,style){
 return {
  fundingSource,style,
  createOrder:async()=>{
   const selected=String(productSelect.value||'').trim().toLowerCase();
   if(!Object.hasOwn(NAMES,selected))throw Error('Select a Pine Script first.');
   paypalAvailability.textContent='Preparing your secure PayPal order...';
   const created=await paypalApi('create',{slug:selected,sessionId:buyerSessionId,browserTimezone});
   savePaypalOrder(created.order);
   renderPaypal();
   paypalAvailability.textContent='Approve the payment in the PayPal window.';
   return created.order.paypalOrderId;
  },
  onApprove:async data=>{
   try{await finalizePaypalPayment(String(data.orderID||''))}
   catch(error){
    console.error('PayPal payment capture failed',error);
    paypalAvailability.textContent=error.message+' If you approved the payment, do not pay twice.';
   }
  },
  onCancel:()=>{
   paypalAvailability.textContent='PayPal payment was canceled. No confirmed purchase was recorded.';
  },
  onError:error=>{
   console.error('PayPal checkout error',error);
   paypalAvailability.textContent='PayPal checkout could not finish. Try again or choose crypto below.';
  }
 };
}
async function initPayPalButtons(state){
 if(!state.paypalReady||!state.paypalClientId){
  paypalSdkArea.hidden=true;
  paypalAvailability.textContent='PayPal is not available yet. You can pay with crypto below.';
  return;
 }
 if(paypalSdkReady||paypalSdkLoading){renderPaypal();return}
 paypalSdkLoading=true;
 paypalAvailability.textContent='Loading secure PayPal and card checkout...';
 try{
  const sdk=await loadPayPalSdk(state.paypalClientId);
  // Buttons require a visible container to measure their iframe width.
  paypalSdkArea.hidden=false;
  const wallet=sdk.Buttons(paypalButtonConfig(sdk.FUNDING.PAYPAL,
   {layout:'vertical',color:'gold',shape:'rect',label:'paypal',height:49}));
  if(!wallet.isEligible())throw Error('PayPal checkout is not available for this buyer or merchant.');
  await wallet.render('#premium-paypal-wallet-buttons');
  // Debit/credit checkout depends on PayPal's funding eligibility.
  try{
   const card=sdk.FUNDING?.CARD?sdk.Buttons(paypalButtonConfig(sdk.FUNDING.CARD,
    {layout:'vertical',color:'black',shape:'rect',label:'pay',height:49})):null;
   if(card?.isEligible()){
    await card.render('#premium-paypal-card-buttons');
    paypalCardNote.hidden=true;
   }else{paypalCardNote.hidden=false}
  }catch(error){
   console.info('PayPal card funding is not eligible for this account or buyer.',error);
   paypalCardNote.hidden=false;
  }
  paypalSdkReady=true;
  paypalAvailability.textContent='Secure checkout by PayPal · USD $12.49';
  renderPaypal();
 }catch(error){
  console.error('PayPal SDK setup failed',error);
  paypalAvailability.textContent=error.message||'PayPal could not be loaded. Try crypto below.';
  paypalSdkArea.hidden=true;
 }finally{paypalSdkLoading=false}
}
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
 }catch(error){paypalMessage.textContent=error.message}
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
 cryptoDetails.open=true;
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
 history.replaceState(null,'','/checkout?script='+encodeURIComponent(slug));
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
  await initPayPalButtons(state);
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
