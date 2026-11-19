import {PRODUCTS,CURRENCIES,OFFER_END,PRICE_USD,ensurePremiumSchema,ready,
 storageAvailable,lookupOrder,publicOrder,createCredentials,provider,checkMinimum,
 validInvoiceUrl,noCache} from '../_lib/premium.js';
import {hashToken} from '../_lib/download-access.js';

const headers=noCache();
const failure=(error,status=400,code='ERROR')=>Response.json({error,code},{status,headers});
const sameOrigin=req=>req.headers.get('Origin')===new URL(req.url).origin;
const configured=env=>ready(env);

export async function onRequestGet({env}){
 const available={};
 for(const slug of Object.keys(PRODUCTS)){
  try{available[slug]=configured(env)&&await storageAvailable(env,slug)}
  catch{available[slug]=false}
 }
 return Response.json({
  products:PRODUCTS,ready:available,
  offerActive:Date.now()<OFFER_END,offerEndsAt:OFFER_END,
  salePrice:PRICE_USD,priceCurrency:'USD',
  paymentProvider:'NOWPayments',currencies:CURRENCIES
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
   const slug=body.slug,currency=String(body.currency||'').toLowerCase();
   if(!Object.hasOwn(PRODUCTS,slug)||!CURRENCIES.includes(currency))
    return failure('Choose a listed product and cryptocurrency.',400,'INVALID_PRODUCT');
   if(!configured(env))return failure('Crypto checkout is not enabled yet. Do not send payment.',503,'NOT_READY');
   if(Date.now()>=OFFER_END)return failure('The Black Friday offer has ended. New purchases are paused.',409,'OFFER_ENDED');
   if(!(await storageAvailable(env,slug)))
    return failure('Private file delivery is not ready. Do not send payment.',503,'NOT_READY');
   const min=await checkMinimum(env,currency);
   if(!min.ok)return failure(min.error,409,'MINIMUM_TOO_HIGH');
   await ensurePremiumSchema(env.DB);
   const o=createCredentials(slug,currency);
   await env.DB.prepare(
    "INSERT INTO premium_nowpayments_orders(id,secret_hash,slug,currency,amount_usd,created_ms,status) VALUES(?,?,?,?,?,?,'creating')"
   ).bind(o.id,await hashToken(o.secret),slug,currency,PRICE_USD,o.createdAt).run();
   let invoice;
   try{
    invoice=await provider(env,'invoice',{method:'POST',body:{
     price_amount:PRICE_USD,price_currency:'usd',pay_currency:currency,
     order_id:o.id,order_description:PRODUCTS[slug]+' | Pine Script v6 source',
     ipn_callback_url:'https://signaltoscript.com/api/nowpayments-ipn',
     success_url:'https://signaltoscript.com/checkout.html?script='+encodeURIComponent(slug),
     cancel_url:'https://signaltoscript.com/checkout.html?script='+encodeURIComponent(slug)
    }});
    if(!invoice?.id||!validInvoiceUrl(invoice?.invoice_url))throw Error('Provider returned invalid invoice link');
    await env.DB.prepare(
     "UPDATE premium_nowpayments_orders SET status='waiting',invoice_id=?,invoice_url=? WHERE id=? AND status='creating'"
    ).bind(String(invoice.id),invoice.invoice_url,o.id).run();
   }catch(error){
    console.error('NOWPayments invoice creation failed',error);
    await env.DB.prepare(
     "UPDATE premium_nowpayments_orders SET status='failed' WHERE id=? AND status='creating'"
    ).bind(o.id).run();
    return failure('Invoice could not be created. No payment was requested. Try another coin or contact support.',502,'INVOICE_FAILED');
   }
   const row=await lookupOrder(env.DB,o.id,o.secret);
   return Response.json({order:{...publicOrder(row),secret:o.secret}},{headers});
  }

  if(!['check','download'].includes(body.action))return failure('Unknown action.',400);
  await ensurePremiumSchema(env.DB);
  const row=await lookupOrder(env.DB,body.id,body.secret);
  if(!row)return failure('Order not found in this browser. Contact support with your order ID.',403,'NOT_AUTHORIZED');
  if(body.action==='check')return Response.json({order:publicOrder(row)},{headers});
  if(row.status!=='paid')return failure('Payment must be finished before downloading.',403,'NOT_PAID');
  if(!env.PREMIUM_BUCKET)return failure('Purchased file temporarily unavailable. Contact support with order ID.',503,'FILE_UNAVAILABLE');
  const file=await env.PREMIUM_BUCKET.get(row.slug+'.pine');
  if(!file)return failure('Purchased file temporarily unavailable. Contact support with order ID.',503,'FILE_UNAVAILABLE');
  return new Response(file.body,{status:200,headers:{
   ...headers,'Content-Type':'text/plain; charset=utf-8',
   'Content-Disposition':'attachment; filename="'+row.slug+'.pine"'
  }});
 }catch(error){
  console.error('Premium checkout error',body.action,error);
  return failure('Checkout temporarily unavailable. Keep your order receipt and do not pay twice.',502,'CHECKOUT_ERROR');
 }
}
