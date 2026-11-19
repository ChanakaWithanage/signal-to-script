// Buyer-side session storage contains a random order capability, never a wallet key.
const PREMIUM_NAMES={
 'gold-breakout-15m':'Gold Breakout 15M Strategy',
 'supertrend-dema-reversal':'Supertrend + DEMA Reversal Strategy'
};
const params=new URLSearchParams(location.search);
const slug=params.get('script');
const title=document.getElementById('premium-product-name');
const reserve=document.getElementById('premium-reserve');
const availability=document.getElementById('premium-availability');
const orderPanel=document.getElementById('premium-order');
const message=document.getElementById('premium-message');
const clock=document.getElementById('premium-clock');
const check=document.getElementById('premium-check');
const download=document.getElementById('premium-download');
let order=null,checking=false;
const storageKey='sts_premium_order_'+slug;
const setMessage=text=>{message.textContent=text};
async function api(action,extra={}){
 const response=await fetch('/api/premium',{
  method:'POST',credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action,...extra})
 });
 if(action==='download'){
  if(response.ok)return response;
  let error;try{error=(await response.json()).error}catch{}
  throw Error(error||'Download failed.');
 }
 const result=await response.json();
 if(!response.ok)throw Error(result.error||'Payment service is unavailable.');
 return result;
}
function saveOrder(o){order=o;try{localStorage.setItem(storageKey,JSON.stringify(o))}catch{}}
function recoverOrder(){
 try{
  const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
  if(saved?.id&&saved?.secret&&saved.slug===slug)return saved;
 }catch{}
 return null;
}
function displayOrder(o){
 document.getElementById('premium-exact-amount').textContent=o.amount+' USDT';
 document.getElementById('premium-address').textContent=o.receiver;
 document.getElementById('premium-expires').textContent=new Date(o.expiresAt).toLocaleString();
 orderPanel.hidden=false;
 reserve.hidden=true;
 document.getElementById('premium-copy-amount').onclick=()=>copy(o.amount,'Amount copied.');
 document.getElementById('premium-copy-address').onclick=()=>copy(o.receiver,'Address copied.');
 updateTime();
}
async function copy(value,success){
 try{await navigator.clipboard.writeText(value);setMessage(success)}
 catch{setMessage('Select and copy the displayed value manually.')}
}
function updateTime(){
 if(!order)return;
 const diff=order.expiresAt-Date.now();
 if(diff<=0){
  clock.textContent='Expired';
  if(!download.hidden)return;
  check.disabled=true;
  setMessage('This order has expired. If you already sent a payment, contact support with your transaction hash.');
 }else{
  const minutes=Math.floor(diff/60000),secs=Math.floor(diff%60000/1000);
  clock.textContent=minutes+'m '+String(secs).padStart(2,'0')+'s';
 }
}
async function verify(silent=false){
 if(!order||checking||!download.hidden)return;
 checking=true;check.disabled=true;
 if(!silent)setMessage('Checking confirmed TRON USDT transfers...');
 try{
  const txHash=document.getElementById('premium-tx').value.trim();
  const result=await api('check',{id:order.id,secret:order.secret,...(txHash?{txHash}:{})});
  if(result.order?.status==='paid'){
   order.status='paid';saveOrder(order);
   check.hidden=true;download.hidden=false;
   setMessage('Payment confirmed on TRON. Your premium Pine Script is unlocked.');
  }else if(result.order?.status==='expired'){
   check.disabled=true;
   setMessage(result.error||'Your reservation expired. Contact support if you sent payment.');
  }else if(!silent){
   setMessage(result.message||'Still waiting for a confirmed transfer of the exact amount.');
  }
 }catch(error){if(!silent)setMessage(error.message)}
 finally{checking=false;if(download.hidden&&order.expiresAt>Date.now())check.disabled=false}
}
reserve.addEventListener('click',async()=>{
 if(!slug||!Object.hasOwn(PREMIUM_NAMES,slug))return;
 reserve.disabled=true;
 setMessage('Reserving your exact USDT transfer amount...');
 try{
  const response=await api('create',{slug});
  saveOrder(response.order);
  displayOrder(order);
  setMessage('Order reserved. Send exactly '+order.amount+' USDT on TRON (TRC20). Do not send using other networks.');
 }catch(error){
  reserve.disabled=false;
  setMessage(error.message);
 }
});
check.addEventListener('click',()=>verify(false));
download.addEventListener('click',async()=>{
 if(!order)return;
 download.disabled=true;
 setMessage('Preparing your purchased Pine Script...');
 try{
  const response=await api('download',{id:order.id,secret:order.secret});
  const blob=await response.blob(),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=slug+'.pine';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
  setMessage('Download started. Your order is saved in this browser for later downloads.');
 }catch(error){setMessage(error.message)}
 finally{download.disabled=false}
});
setInterval(updateTime,1000);
setInterval(()=>{if(order&&Date.now()<order.expiresAt)verify(true)},22000);
(async()=>{
 if(!Object.hasOwn(PREMIUM_NAMES,slug)){
  title.textContent='Product not found';
  availability.textContent='Choose one of the two premium strategies from the homepage.';
  return;
 }
 title.textContent=PREMIUM_NAMES[slug];
 try{
  const response=await fetch('/api/premium',{cache:'no-store'});
  if(!response.ok)throw Error('Checkout cannot be checked.');
  const state=await response.json();
  const saved=recoverOrder();
  if(saved){
   saveOrder(saved);displayOrder(saved);
   availability.textContent='Saved order found in this browser. Check its status before sending any new payment.';
   await verify(true);
   return;
  }
  if(!state.offerActive){
   availability.textContent='The early Black Friday promotion has ended. New orders are paused.';
   return;
  }
  if(!state.ready?.[slug]){
   availability.textContent='Checkout is being prepared. No payment can be accepted until private file delivery is ready. Please check back or contact support.';
   return;
  }
  availability.textContent='Checkout is ready. Reserve your payment amount to start. No account is required.';
  reserve.disabled=false;
 }catch(error){availability.textContent='Checkout is temporarily unavailable. Please do not send payment.'}
})();
