import {FREE_SCRIPTS,freeScriptFile} from '../_lib/free-scripts.js';
import {MEMBERSHIP,MEMBERSHIP_NAME,PRODUCTS,CURRENCIES,OFFER_END,PRICE_USD,ensurePremiumSchema,ready,
 storageAvailable,lookupOrder,publicOrder,createCredentials,provider,checkMinimum,
 validInvoiceUrl,noCache} from '../_lib/premium.js';
import {manualReceiptId} from './manual-request.js';
import {hashToken} from '../_lib/download-access.js';
import {trackCheckout,updateCheckoutAttempt,utcTime,sriLankaTime} from '../_lib/checkout-tracking.js';

const headers=noCache();
const failure=(error,status=400,code='ERROR')=>Response.json({error,code},{status,headers});
const sameOrigin=req=>req.headers.get('Origin')===new URL(req.url).origin;
const configured=env=>ready(env);

export async function onRequestGet({env}){
 if(env.DB){
  try{await ensurePremiumSchema(env.DB)}catch(error){console.error('Premium D1 schema migration failed',error)}
 }
 const available={};
 for(const slug of Object.keys(PRODUCTS)){
  try{available[slug]=configured(env)&&await storageAvailable(env,slug)}
  catch{available[slug]=false}
 }
 return Response.json({
  products:PRODUCTS,freeScripts:FREE_SCRIPTS,ready:available,
  offerActive:Date.now()<OFFER_END,offerEndsAt:OFFER_END,
  salePrice:PRICE_USD,priceCurrency:'USD',
  paymentProvider:'NOWPayments',currencies:CURRENCIES,
  paypalReady:env.PAYPAL_ENABLED==='true'&&!!env.PAYPAL_CLIENT_ID&&!!env.PAYPAL_CLIENT_SECRET&&
   ['sandbox','live'].includes(env.PAYPAL_MODE)&&
   !!env.DB&&!!env.PREMIUM_BUCKET&&Date.now()<OFFER_END,
  // The REST Client ID is public and needed by PayPal's official browser SDK.
  paypalClientId:env.PAYPAL_ENABLED==='true'&&!!env.PAYPAL_CLIENT_SECRET&&
   ['sandbox','live'].includes(env.PAYPAL_MODE)?String(env.PAYPAL_CLIENT_ID||''):null
 },{headers});
}

export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return failure('Invalid request origin.',403,'ORIGIN');
 if(!(request.headers.get('Content-Type')||'').includes('application/json'))
  return failure('JSON required.',415);
 if(!env.DB)return failure('Checkout is not configured. Do not send a payment.',503,'NOT_READY');
 const text=await request.text();
 if(text.length>2500)return failure('Request is too large.',413);
 let body;try{body=JSON.parse(text)}catch{return failure('Invalid request.',400)}
 try{
  if(body.action==='create'){
   const slug=String(body.slug||'').trim().toLowerCase();
   const currency=String(body.currency||'auto').trim().toLowerCase();
   if(!Object.hasOwn(PRODUCTS,slug))
    return failure('Selected script is unavailable. Please choose a script again.',400,'INVALID_PRODUCT');
   if(currency!=='auto'&&!CURRENCIES.includes(currency))
    return failure('Selected payment network is unavailable. Please choose USDT TRC20 or BEP20.',400,'INVALID_CURRENCY');
   await ensurePremiumSchema(env.DB);
   const attempt=await trackCheckout(env.DB,request,body,'nowpayments',slug,currency);
   if(!configured(env)){
    await updateCheckoutAttempt(env.DB,attempt.id,'unavailable',null,'NOT_READY');
    return failure('Crypto checkout is not enabled yet.',503,'NOT_READY');
   }
   if(Date.now()>=OFFER_END){
    await updateCheckoutAttempt(env.DB,attempt.id,'expired',null,'OFFER_ENDED');
    return failure('The Black Friday offer has ended. New purchases are paused.',409,'OFFER_ENDED');
   }
   if(!(await storageAvailable(env,slug))){
    await updateCheckoutAttempt(env.DB,attempt.id,'unavailable',null,'FILE_NOT_READY');
    return failure('Private file delivery is not ready.',503,'NOT_READY');
   }
   if(currency!=='auto'){
    const min=await checkMinimum(env,currency);
    if(!min.ok){
     await updateCheckoutAttempt(env.DB,attempt.id,'minimum_blocked',null,'MINIMUM_TOO_HIGH');
     return failure(min.error,409,'MINIMUM_TOO_HIGH');
    }
   }
   // The requested coin is a checkout preference, not a restriction on verified payments.
   // Store auto so a permitted coin switch inside the widget does not block fulfillment.
   const o=createCredentials(slug,'auto');
   await env.DB.prepare(
    "INSERT INTO premium_nowpayments_orders(id,secret_hash,slug,currency,amount_usd,created_ms,created_at_utc,created_at_ist,visitor_session_id,visitor_country,visitor_region,visitor_city,visitor_timezone,visitor_browser_timezone,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'creating')"
   ).bind(o.id,await hashToken(o.secret),MEMBERSHIP,'auto',PRICE_USD,o.createdAt,
     utcTime(o.createdAt),sriLankaTime(o.createdAt),attempt.sessionId,
     attempt.country,attempt.region,attempt.city,attempt.timezone,attempt.browserTimezone).run();
   let invoice;
   try{
    invoice=await provider(env,'invoice',{method:'POST',body:{
     price_amount:Number(PRICE_USD),price_currency:'usd',
     ...(currency==='auto'?{}:{pay_currency:currency}),
     order_id:o.id,order_description:MEMBERSHIP_NAME,
     ipn_callback_url:'https://signaltoscript.com/api/nowpayments-ipn',
     success_url:'https://signaltoscript.com/checkout.html?script='+encodeURIComponent(slug),
     cancel_url:'https://signaltoscript.com/checkout.html?script='+encodeURIComponent(slug)
    }});
    if(!/^[0-9]{3,25}$/.test(String(invoice?.id||''))||!validInvoiceUrl(invoice?.invoice_url))
     throw Error('Provider returned invalid invoice details');
    await env.DB.prepare(
     "UPDATE premium_nowpayments_orders SET status='waiting',invoice_id=?,invoice_url=? WHERE id=? AND status='creating'"
    ).bind(String(invoice.id),invoice.invoice_url,o.id).run();
    await updateCheckoutAttempt(env.DB,attempt.id,'invoice_created',o.id);
   }catch(error){
    console.error('NOWPayments invoice creation failed',error);
    await env.DB.prepare(
     "UPDATE premium_nowpayments_orders SET status='failed' WHERE id=? AND status='creating'"
    ).bind(o.id).run();
    await updateCheckoutAttempt(env.DB,attempt.id,'failed',o.id,'INVOICE_FAILED');
    return failure('Invoice could not be created. No payment was requested. Try another coin or contact support.',502,'INVOICE_FAILED');
   }
   const row=await lookupOrder(env.DB,o.id,o.secret);
   return Response.json({order:{...publicOrder(row),secret:o.secret}},{headers});
  }

  if(!['check','download'].includes(body.action))return failure('Unknown action.',400);
  await ensurePremiumSchema(env.DB);
  let row;
  if(body.method==='manual'){
   if(typeof body.secret!=='string'||!/^[a-f0-9]{64}$/.test(body.secret)||await manualReceiptId(body.secret)!==body.id)
    return failure('Invalid membership link.',403);
   const manual=await env.DB.prepare('SELECT id,slug,status,price_usd,created_ms FROM premium_manual_requests WHERE id=? AND slug=?').bind(body.id,MEMBERSHIP).first();
   if(manual)row={...manual,amount_usd:manual.price_usd};
  }else row=await lookupOrder(env.DB,body.id,body.secret);
  if(!row)return failure('Order not found in this browser. Contact support with your order ID.',403,'NOT_AUTHORIZED');
  if(body.action==='check')return Response.json({order:publicOrder(row)},{headers});
  if(row.status!=='paid')return failure('Payment must be finished before downloading.',403,'NOT_PAID');
  const requested=body.slug??(row.slug===MEMBERSHIP?Object.keys(PRODUCTS)[0]:row.slug);
  const free=row.slug===MEMBERSHIP&&Object.hasOwn(FREE_SCRIPTS,requested);
  if(!free&&(!Object.hasOwn(PRODUCTS,requested)||(row.slug!==MEMBERSHIP&&row.slug!==requested)))
   return failure('Script unavailable for this receipt.',403);
  const file=free?await freeScriptFile(env,request,requested):await env.PREMIUM_BUCKET?.get(requested+'.pine');
  if(!file)return failure('Purchased file temporarily unavailable. Contact support with order ID.',503,'FILE_UNAVAILABLE');
  return new Response(file.body,{status:200,headers:{
   ...headers,'Content-Type':'text/plain; charset=utf-8',
   'Content-Disposition':'attachment; filename="'+requested+'.pine"'
  }});
 }catch(error){
  console.error('Premium checkout error',body.action,error);
  return failure('Checkout temporarily unavailable. Keep your order receipt and do not pay twice.',502,'CHECKOUT_ERROR');
 }
}
