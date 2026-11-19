// Signed NOWPayments IPN. Never trust a browser redirect or unsignalled "paid" claim.
import {ensurePremiumSchema,validateSignature,matchesPayment,settlePayment,provider} from '../_lib/premium.js';

const HEADERS={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const respond=(message,status=200)=>Response.json({message},{status,headers:HEADERS});

export async function onRequestPost({request,env}){
 if(!env.DB||!env.NOWPAYMENTS_IPN_SECRET||!env.NOWPAYMENTS_API_KEY)
  return respond('Payment verification is not configured.',503);
 const signature=request.headers.get('x-nowpayments-sig');
 if(!(request.headers.get('Content-Type')||'').includes('application/json'))
  return respond('JSON required.',415);
 const raw=await request.text();
 if(raw.length>16000)return respond('Request too large.',413);
 let event;
 try{event=JSON.parse(raw)}catch{return respond('Invalid JSON.',400)}
 if(!event||typeof event!=='object'||Array.isArray(event))return respond('Invalid notification.',400);
 try{
  if(!(await validateSignature(event,signature,env.NOWPAYMENTS_IPN_SECRET)))
   return respond('Invalid notification signature.',401);
  const id=String(event.order_id||'');
  const paymentId=String(event.payment_id||'');
  const invoiceId=String(event.invoice_id||'');
  if(!/^[0-9a-f]{24}$/.test(id)||!/^[0-9]{3,25}$/.test(paymentId)||
     !/^[0-9]{3,25}$/.test(invoiceId))return respond('Unknown order or invoice.',422);
  await ensurePremiumSchema(env.DB);
  const row=await env.DB.prepare(
   'SELECT * FROM premium_nowpayments_orders WHERE id=? AND invoice_id=? LIMIT 1'
  ).bind(id,invoiceId).first();
  if(!row||row.status==='failed')return respond('Unknown invoice.',404);
  if(row.status==='paid')return respond('Already processed.');

  // Signed notification still needs an authenticated server-to-server status check.
  // Never unlock on 'confirmed', 'partially_paid', 'waiting' or a browser redirect.
  if(event.payment_status!=='finished')return respond('Awaiting final settlement.');
  const payment=await provider(env,'payment/'+paymentId,{timeoutMs:2200});
  if(!matchesPayment(row,payment)||!matchesPayment(row,event))
   return respond('Provider payment does not match the invoice.',422);
  if(!(await settlePayment(env.DB,row,payment)))return respond('Transfer already used.',409);
  return respond('Payment finished and order unlocked.');
 }catch(error){
  console.error('NOWPayments notification could not be processed',error);
  return respond('Temporary verification error; please retry.',503);
 }
}
