import {
 PRODUCTS,isPremium,OFFER_END,RECEIVER,USDT,ensurePremiumSchema,createOrder,
 fetchOrder,orderResponse,storageAvailable,locatePayment,settleOrder,noCache
} from '../_lib/premium.js';

const headers=noCache();
const fail=(error,status=400,code='ERROR')=>Response.json({error,code},{status,headers});
const sameOrigin=req=>req.headers.get('Origin')===new URL(req.url).origin;

export async function onRequestGet({env}){
 const enabled=env.PREMIUM_CHECKOUT_ENABLED==='true';
 const ready={};
 for(const slug of Object.keys(PRODUCTS)){
  try{ready[slug]=enabled&&await storageAvailable(env,slug)}catch{ready[slug]=false}
 }
 return Response.json({
  products:PRODUCTS,
  ready,
  offerActive:Date.now()<OFFER_END,
  offerEndsAt:OFFER_END,
  salePrice:'1.99',
  plannedRegularPrice:'4.99',
  network:'TRON (TRC20)',receiver:RECEIVER,contract:USDT
 },{headers});
}

export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return fail('Invalid request origin.',403,'ORIGIN');
 if(!(request.headers.get('Content-Type')||'').includes('application/json'))return fail('JSON required.',415);
 if(!env.DB)return fail('Checkout is not configured. No payment has been requested.',503,'NOT_READY');
 const text=await request.text();
 if(text.length>2500)return fail('Request is too large.',413);
 let body;try{body=JSON.parse(text)}catch{return fail('Invalid request.',400)}
 const action=body?.action;
 try{
  if(action==='create'){
   const slug=body.slug;
   if(!isPremium(slug))return fail('Unknown product.',404);
   if(env.PREMIUM_CHECKOUT_ENABLED!=='true')return fail('Checkout is not yet enabled. Do not send payment.',503,'NOT_READY');
   if(!(await storageAvailable(env,slug)))
    return fail('Checkout is not open yet. The private premium file needs to be configured first. Do not send a payment.',503,'NOT_READY');
   const result=await createOrder(env.DB,slug);
   if(result.error)return fail(result.error,result.status,'NO_SLOT');
   return Response.json(result,{headers});
  }
  if(!['check','download'].includes(action))return fail('Unknown action.',400);
  await ensurePremiumSchema(env.DB);
  const order=await fetchOrder(env.DB,body.id,body.secret);
  if(!order)return fail('Order not found on this browser. Keep your receipt and contact support.',403,'NOT_AUTHORIZED');
  if(action==='download'){
   if(order.status!=='paid')return fail('A confirmed payment is required to download this script.',403,'NOT_PAID');
   if(!env.PREMIUM_BUCKET)return fail('The purchased file is temporarily unavailable. Contact support with your order ID.',503,'FILE_UNAVAILABLE');
   const file=await env.PREMIUM_BUCKET.get(order.slug+'.pine');
   if(!file)return fail('The purchased file is temporarily unavailable. Contact support with your order ID.',503,'FILE_UNAVAILABLE');
   return new Response(file.body,{
    status:200,headers:{
     'Content-Type':'text/plain; charset=utf-8',
     'Content-Disposition':'attachment; filename="'+order.slug+'.pine"',
     ...headers
    }
   });
  }
  if(order.status==='paid')return Response.json({order:orderResponse(order)},{headers});
  if(Date.now()>order.expires_ms)
   return Response.json({order:orderResponse(order),
    error:'The reservation expired. If you sent USDT, do not send it again. Contact support with the TXID.'},{headers});
  const found=await locatePayment(order,env,body.txHash||'');
  if(found.code==='CONFIRMED'){
   const claimed=await settleOrder(env.DB,order,found.txid);
   if(!claimed.paid)return fail('This transfer was already assigned to another order. Contact support.',409,'TX_USED');
   const paid=await fetchOrder(env.DB,body.id,body.secret);
   return Response.json({order:orderResponse(paid)},{headers});
  }
  return Response.json({order:orderResponse(order),verification:found.code,
   message:found.code==='AMBIGUOUS'?'Enter your transaction hash to identify your payment.':
    found.code==='INVALID_HASH'?'Enter a valid 64-character transaction hash.':
    'Awaiting a confirmed USDT TRC20 transfer of the exact quoted amount.'},{headers});
 }catch(error){
  console.error('Premium checkout operation failed',action,error);
  return fail('Payment check temporarily unavailable. Keep your order and transaction hash. Do not pay twice.',502,'CHECK_UNAVAILABLE');
 }
}
