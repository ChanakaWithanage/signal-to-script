import {bodyOf,json,sameOrigin,emailOf,validEmail,randomHex,digest,ensureSchema} from '../_lib/access.js';
import {planOf} from '../_lib/plans.js';
import {paymentReady,CRYPTO_COINS,ensureCryptoSchema,paymentProvider,minimumSupported,
 validInvoiceUrl,findOrder,orderPublic,decryptCode} from '../_lib/crypto.js';
const fail=(message,status=400)=>json({error:message},status);
export async function onRequestGet({request,env}){
 if(!env.DB)return fail('Membership checkout is unavailable.',503);
 const q=new URL(request.url).searchParams,id=q.get('id'),secret=q.get('secret');
 if(!id||!secret)return json({ready:paymentReady(env),coins:CRYPTO_COINS});
 try{
  await ensureCryptoSchema(env.DB);
  const order=await findOrder(env.DB,id,secret);
  if(!order)return fail('Order not found in this browser.',403);
  const answer={...orderPublic(order)};
  if(order.provisioned_ms){
   answer.accessCode=await decryptCode(order.code_cipher,env.GOLD_CRYPTO_CODE_KEY);
   if(!answer.accessCode)return fail('Your payment is verified. Contact support to retrieve your membership code.',503);
   answer.email=order.email;
  }
  return json({order:answer});
 }catch(error){console.error('Gold crypto status failed',error);return fail('Unable to check crypto payment status.',503)}
}
export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return fail('Invalid origin.',403);
 if(!paymentReady(env))return fail('Instant crypto checkout is not configured yet.',503);
 let body;try{body=await bodyOf(request)}catch{return fail('Invalid request.',400)}
 const email=emailOf(body.email),plan=planOf(body.plan),coin=String(body.coin||'auto').toLowerCase();
 if(!validEmail(email)||!plan||!CRYPTO_COINS.includes(coin))return fail('Enter a valid email, membership plan and cryptocurrency.',400);
 const now=Date.now();
 try{
  await ensureSchema(env.DB);await ensureCryptoSchema(env.DB);
  if(coin!=='auto'){
   const minimum=await minimumSupported(env,coin,plan.priceCents/100);
   if(!minimum.ok)return fail(minimum.message,409);
  }
  const id=randomHex(12),secret=randomHex(),amount=(plan.priceCents/100).toFixed(2);
  await env.DB.prepare("INSERT INTO gold_crypto_orders(id,secret_hash,email,plan,amount_usd,currency,created_ms,status) VALUES(?,?,?,?,?,?,?,'creating')")
   .bind(id,await digest(secret),email,plan.id,amount,coin,now).run();
  try{
   const invoice=await paymentProvider(env,'invoice',{method:'POST',body:{
    price_amount:Number(amount),price_currency:'usd',...(coin==='auto'?{}:{pay_currency:coin}),
    order_id:id,order_description:'Gold Signal Room VIP '+plan.label+' ('+plan.days+' days)',
    ipn_callback_url:'https://gold.signaltoscript.com/api/crypto-ipn',
    success_url:'https://gold.signaltoscript.com/?crypto=return',
    cancel_url:'https://gold.signaltoscript.com/?crypto=cancel'
   }});
   if(!/^[0-9]{3,25}$/.test(String(invoice?.id||''))||!validInvoiceUrl(invoice?.invoice_url))
    throw Error('Invalid hosted invoice');
   await env.DB.prepare("UPDATE gold_crypto_orders SET status='waiting',invoice_id=?,invoice_url=? WHERE id=? AND status='creating'").bind(String(invoice.id),invoice.invoice_url,id).run();
   return json({order:{id,secret,plan:plan.id,amountUsd:amount,status:'pending',invoiceUrl:invoice.invoice_url}});
  }catch(error){
   console.error('Gold NOWPayments invoice failed',error);
   await env.DB.prepare("UPDATE gold_crypto_orders SET status='failed' WHERE id=? AND status='creating'").bind(id).run();
   return fail('Could not create this crypto invoice. Try another coin or request manual payment.',502);
  }
 }catch(error){console.error('Gold crypto order unavailable',error);return fail('Checkout temporarily unavailable. Try again.',503)}
}
