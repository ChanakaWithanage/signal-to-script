import {json,ensureSchema} from '../_lib/access.js';
import {ensureCryptoSchema,paymentReady,verifiedSignature,paymentMatches,paymentProvider,fulfillOrder} from '../_lib/crypto.js';
const fail=(message,status=400)=>json({message},status);
export async function onRequestPost({request,env}){
 if(!paymentReady(env)||!env.GOLD_CRYPTO_CODE_KEY)return fail('Crypto payment verification unavailable.',503);
 if(!request.headers.get('content-type')?.includes('application/json'))return fail('JSON required.',415);
 const raw=await request.text();
 if(raw.length>16000)return fail('Request too large.',413);
 let event;try{event=JSON.parse(raw)}catch{return fail('Invalid event.',400)}
 if(!event||typeof event!=='object'||Array.isArray(event))return fail('Invalid event.',400);
 if(!await verifiedSignature(event,request.headers.get('x-nowpayments-sig'),env.NOWPAYMENTS_IPN_SECRET))
  return fail('Invalid payment signature.',401);
 const id=String(event.order_id||''),paymentId=String(event.payment_id||''),invoiceId=String(event.invoice_id||'');
 if(!/^[a-f0-9]{24}$/.test(id)||!/^[0-9]{3,25}$/.test(invoiceId)||!/^[0-9]{3,25}$/.test(paymentId))
  return fail('Unknown payment.',422);
 try{
  await ensureSchema(env.DB);await ensureCryptoSchema(env.DB);
  const row=await env.DB.prepare("SELECT * FROM gold_crypto_orders WHERE id=? AND invoice_id=? LIMIT 1").bind(id,invoiceId).first();
  if(!row||row.status==='failed')return fail('Unknown invoice.',404);
  if(row.provisioned_ms)return json({message:'Membership already activated.'});
  if(event.payment_status!=='finished')return json({message:'Awaiting final settlement.'});
  // Re-query the payment independently using merchant credentials. A signed
  // webhook or a return-to-website URL alone must not grant VIP access.
  const verified=await paymentProvider(env,'payment/'+paymentId,{timeoutMs:5000});
  if(!paymentMatches(row,event)||!paymentMatches(row,verified))return fail('Payment does not match this order.',422);
  if(row.status==='waiting'){
   const updated=await env.DB.prepare("UPDATE gold_crypto_orders SET status='paid',payment_id=?,paid_ms=? WHERE id=? AND invoice_id=? AND status='waiting' AND NOT EXISTS(SELECT 1 FROM gold_crypto_orders WHERE payment_id=?)")
    .bind(paymentId,Date.now(),row.id,row.invoice_id,paymentId).run();
   if(updated.meta?.changes!==1)return json({message:'Payment is already being processed.'});
  }else if(row.status!=='paid')return json({message:'Payment verification is being processed.'});
  const done=await fulfillOrder(env.DB,env,row);
  return json({message:done?'VIP membership activated.':'Payment confirmed. Membership activation is being processed.'});
 }catch(error){
  console.error('Gold crypto IPN verification/fulfillment failed',error);
  return fail('Temporary payment processing error; retry notification.',503);
 }
}
