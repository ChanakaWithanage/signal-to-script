// PayPal redirect checkout with server-side capture, order verification, and private R2 delivery.
import {PRICE_USD,PRODUCTS,OFFER_END,storageAvailable,noCache} from '../_lib/premium.js';
import {randomToken,hashToken} from '../_lib/download-access.js';
import {utcTime,sriLankaTime,trackCheckout,updateCheckoutAttempt,visitorMeta} from '../_lib/checkout-tracking.js';

const headers=noCache();
const fail=(error,status=400,code='ERROR')=>Response.json({error,code},{status,headers});
const sameOrigin=request=>request.headers.get('Origin')===new URL(request.url).origin;
const configured=env=>env.PAYPAL_ENABLED==='true'&&!!env.PAYPAL_CLIENT_ID&&
 ['sandbox','live'].includes(env.PAYPAL_MODE)&&
 !!env.PAYPAL_CLIENT_SECRET&&!!env.DB&&!!env.PREMIUM_BUCKET;
const paypalBase=env=>env.PAYPAL_MODE==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';
const validId=id=>typeof id==='string'&&/^[0-9a-f]{24}$/.test(id);
const validSecret=secret=>typeof secret==='string'&&/^[0-9a-f]{64}$/.test(secret);
function approvalLink(links){
 const item=links?.find(x=>x.rel==='approve'||x.rel==='payer-action');
 try{const u=new URL(item.href);return u.protocol==='https:'&&
  (u.hostname==='paypal.com'||u.hostname.endsWith('.paypal.com'))?u.href:null}catch{return null}
}
async function paypalApi(env,path,{method='GET',body,requestId}={}){
 const basic=btoa(env.PAYPAL_CLIENT_ID+':'+env.PAYPAL_CLIENT_SECRET);
 const auth=await fetch(paypalBase(env)+'/v1/oauth2/token',{method:'POST',
  headers:{Authorization:'Basic '+basic,'Content-Type':'application/x-www-form-urlencoded'},
  body:'grant_type=client_credentials',signal:AbortSignal.timeout(9000)});
 if(!auth.ok)throw Error('PayPal authentication failed');
 const token=(await auth.json()).access_token;
 if(!token)throw Error('PayPal token missing');
 const response=await fetch(paypalBase(env)+path,{method,
  headers:{Authorization:'Bearer '+token,Accept:'application/json',
    ...(body?{'Content-Type':'application/json'}:{}),
    ...(requestId?{'PayPal-Request-Id':requestId}:{}),
    Prefer:'return=representation'},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(13000)});
 let result={};try{result=await response.json()}catch{}
 if(!response.ok)throw Error('PayPal returned HTTP '+response.status+' '+String(result.name||''));
 return result;
}
async function ensurePaypalSchema(db){
 await db.prepare(`CREATE TABLE IF NOT EXISTS premium_paypal_orders (
  id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL UNIQUE, slug TEXT NOT NULL,
  amount_usd TEXT NOT NULL, paypal_order_id TEXT NOT NULL UNIQUE,
  paypal_capture_id TEXT UNIQUE, status TEXT NOT NULL,
  created_ms INTEGER NOT NULL, created_at_utc TEXT NOT NULL, created_at_ist TEXT NOT NULL,
  paid_ms INTEGER, paid_at_utc TEXT, paid_at_ist TEXT,
  visitor_session_id TEXT, visitor_country TEXT, visitor_region TEXT,
  visitor_city TEXT, visitor_timezone TEXT
 )`).run();
}
async function rowFor(db,id,secret){
 if(!validId(id)||!validSecret(secret))return null;
 return db.prepare('SELECT * FROM premium_paypal_orders WHERE id=? AND secret_hash=?')
  .bind(id,await hashToken(secret)).first();
}
function publicRow(row,secret){
 return {id:row.id,slug:row.slug,amountUsd:row.amount_usd,
  paypalOrderId:row.paypal_order_id,status:row.status==='paid'?'paid':'pending',
  ...(secret?{secret}:{})};
}
function captureValid(row,details){
 if(details.status!=='COMPLETED')return null;
 const units=details.purchase_units;
 if(!Array.isArray(units)||units.length!==1)return null;
 const unit=units[0];
 if(String(unit.custom_id)!==row.id||String(unit.reference_id)!==row.id)return null;
 const capture=unit.payments?.captures?.[0];
 if(!capture||capture.status!=='COMPLETED'||!/^[A-Za-z0-9-]{8,50}$/.test(String(capture.id||'')))return null;
 if(capture.amount?.currency_code!=='USD'||String(capture.amount?.value)!==String(row.amount_usd))return null;
 if(unit.amount?.currency_code!=='USD'||String(unit.amount?.value)!==String(row.amount_usd))return null;
 return capture;
}
export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return fail('Invalid request origin.',403,'ORIGIN');
 if(!(request.headers.get('Content-Type')||'').includes('application/json'))return fail('JSON required.',415);
 if(!env.DB)return fail('Checkout is not configured.',503,'NOT_READY');
 let body;try{const raw=await request.text();if(raw.length>2500)return fail('Request too large.',413);
  body=JSON.parse(raw)}catch{return fail('Invalid request.',400)}
 try{
  await ensurePaypalSchema(env.DB);
  if(body.action==='create'){
   const slug=String(body.slug||'').trim().toLowerCase();
   if(!Object.hasOwn(PRODUCTS,slug))return fail('Please choose a Pine Script.',400,'INVALID_PRODUCT');
   const attempt=await trackCheckout(env.DB,request,body,'paypal',slug,'usd');
   if(!configured(env)||Date.now()>=OFFER_END||!(await storageAvailable(env,slug))){
    await updateCheckoutAttempt(env.DB,attempt.id,'unavailable',null,'NOT_READY');
    return fail('PayPal checkout is not available yet.',503,'NOT_READY');
   }
   const id=randomToken().slice(0,24),secret=randomToken(),ms=Date.now();
   let details;
   try{
    details=await paypalApi(env,'/v2/checkout/orders',{method:'POST',requestId:id,body:{
     intent:'CAPTURE',purchase_units:[{reference_id:id,custom_id:id,
      description:PRODUCTS[slug]+' | Pine Script v6 source',
      amount:{currency_code:'USD',value:PRICE_USD}}],
     application_context:{
      brand_name:'Signal to Script',user_action:'PAY_NOW',shipping_preference:'NO_SHIPPING',
      return_url:'https://signaltoscript.com/checkout.html?script='+encodeURIComponent(slug)+'&paypal_return=1',
      cancel_url:'https://signaltoscript.com/checkout.html?script='+encodeURIComponent(slug)+'&paypal_cancel=1'
     }
    }});
   }catch(error){
    console.error('PayPal order creation failed',error);
    await updateCheckoutAttempt(env.DB,attempt.id,'failed',null,'PAYPAL_CREATE');
    return fail('PayPal could not start checkout. Please try again.',502,'PAYPAL_CREATE');
   }
   const approvalUrl=approvalLink(details.links),paypalOrderId=String(details.id||'');
   if(!approvalUrl||!/^[A-Z0-9]{10,40}$/.test(paypalOrderId)){
    await updateCheckoutAttempt(env.DB,attempt.id,'failed',null,'PAYPAL_RESPONSE');
    return fail('PayPal checkout link could not be verified.',502,'PAYPAL_RESPONSE');
   }
   const meta=visitorMeta(request,body);
   await env.DB.prepare(`INSERT INTO premium_paypal_orders(
    id,secret_hash,slug,amount_usd,paypal_order_id,status,created_ms,
    created_at_utc,created_at_ist,visitor_session_id,visitor_country,visitor_region,
    visitor_city,visitor_timezone
    ) VALUES (?,?,?,?,?,'waiting',?,?,?,?,?,?,?,?)`)
    .bind(id,await hashToken(secret),slug,PRICE_USD,paypalOrderId,ms,
     utcTime(ms),sriLankaTime(ms),meta.sessionId,meta.country,meta.region,meta.city,
     meta.timezone).run();
   await updateCheckoutAttempt(env.DB,attempt.id,'order_created',id);
   return Response.json({order:{...publicRow({id,slug,amount_usd:PRICE_USD,paypal_order_id:paypalOrderId,status:'waiting'},secret),approvalUrl}},{headers});
  }
  if(!['capture','status','download'].includes(body.action))return fail('Unknown action.',400);
  const row=await rowFor(env.DB,body.id,body.secret);
  if(!row)return fail('Order not found in this browser.',403,'NOT_AUTHORIZED');
  if(body.action==='capture'){
   if(row.status==='paid')return Response.json({order:publicRow(row)},{headers});
   if(!configured(env))return fail('PayPal verification is unavailable.',503,'NOT_READY');
   if(String(body.paypalOrderId||'')!==row.paypal_order_id)return fail('PayPal order mismatch.',403,'INVALID_ORDER');
   let details;
   try{details=await paypalApi(env,'/v2/checkout/orders/'+encodeURIComponent(row.paypal_order_id)+'/capture',
     {method:'POST',requestId:row.id+'-capture'});}
   catch(error){
    // A repeated capture request can return "already captured"; verify against PayPal's recorded order.
    console.error('PayPal capture needed status lookup',error);
    details=await paypalApi(env,'/v2/checkout/orders/'+encodeURIComponent(row.paypal_order_id));
   }
   if(String(details.id||'')!==row.paypal_order_id)return fail('PayPal order verification failed.',422,'MISMATCH');
   const captured=captureValid(row,details);
   if(!captured)return fail('PayPal payment has not completed yet.',409,'PAYMENT_PENDING');
   const ms=Date.now();
   const result=await env.DB.prepare(`UPDATE premium_paypal_orders
     SET status='paid',paypal_capture_id=?,paid_ms=?,paid_at_utc=?,paid_at_ist=?
     WHERE id=? AND paypal_order_id=? AND status='waiting'
     AND NOT EXISTS(SELECT 1 FROM premium_paypal_orders WHERE paypal_capture_id=?)`)
    .bind(captured.id,ms,utcTime(ms),sriLankaTime(ms),row.id,row.paypal_order_id,captured.id).run();
   if(result.meta?.changes!==1){
    const reread=await rowFor(env.DB,row.id,body.secret);
    if(reread?.status!=='paid'||reread.paypal_capture_id!==captured.id)
     return fail('Payment could not be reconciled.',409,'CAPTURE_CONFLICT');
   }
   return Response.json({order:{...publicRow(row),status:'paid'}},{headers});
  }
  if(body.action==='status')return Response.json({order:publicRow(row)},{headers});
  if(row.status!=='paid')return fail('Payment has not completed yet.',403,'NOT_PAID');
  const file=await env.PREMIUM_BUCKET?.get(row.slug+'.pine');
  if(!file)return fail('Purchased download is temporarily unavailable.',503,'FILE_UNAVAILABLE');
  return new Response(file.body,{status:200,headers:{...headers,
   'Content-Type':'text/plain; charset=utf-8',
   'Content-Disposition':'attachment; filename="'+row.slug+'.pine"'}});
 }catch(error){
  console.error('PayPal checkout error',error);
  return fail('PayPal checkout is temporarily unavailable.',502,'CHECKOUT_ERROR');
 }
}
