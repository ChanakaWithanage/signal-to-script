// Each buyer receives an embedded NOWPayments widget for their own tracked invoice.
const NAMES={
 'gold-breakout-15m':'Gold Breakout 15M Strategy',
 'supertrend-dema-reversal':'Supertrend + DEMA Reversal Strategy'
};
const params=new URLSearchParams(location.search);
const initialSlug=String(params.get('script')||'').trim().toLowerCase();
const productSelect=document.getElementById('premium-script');
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
const payLink=document.getElementById('premium-pay-link');
const download=document.getElementById('premium-download');
const storageKey=()=> 'sts_nowpayments_order_'+slug;
let order=null,checking=false;
const setMessage=value=>{message.textContent=value};
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
 document.getElementById('premium-pay-coin').textContent='Select your coin and network below';
 document.getElementById('premium-order-id').textContent=order.id;
 newOrder.hidden=true;orderPanel.hidden=false;
 if(order.status==='paid'){
  widgetContainer.hidden=true;payLink.hidden=true;check.hidden=true;download.hidden=false;
  availability.textContent='Payment confirmed! Your premium source is ready.';
  setMessage('Thank you for your purchase. Download your Pine Script below.');
 }else if(order.status==='failed'){
  widgetContainer.hidden=true;payLink.hidden=true;check.hidden=true;download.hidden=true;
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
  download.hidden=true;check.hidden=false;
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
 if(order){display();refresh(true)}else{setMessage('');loadAvailability()}
});
async function refresh(silent=false){
 if(!order||checking||order.status==='paid')return;
 checking=true;check.disabled=true;
 if(!silent)setMessage('Checking your order status...');
 try{
  const result=await api('check',{id:order.id,secret:order.secret});
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
 setMessage('Preparing your secure NOWPayments widget...');
 try{
  const result=await api('create',{slug,currency:'auto'});
  saveOrder(result.order);
  display();
 }catch(error){
  reserve.disabled=false;
  setMessage(error.message);
 }
});
check.addEventListener('click',()=>refresh(false));
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
  availability.textContent='Ready for secure payment with NOWPayments. No sign-in needed.';
  reserve.disabled=false;
 }catch(error){
  availability.textContent='Checkout is temporarily unavailable. Do not send a payment.';
 }
}
loadAvailability();
