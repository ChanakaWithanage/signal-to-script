// Offline integration tests for NOWPayments invoice identity, minimums, signed IPN and R2 delivery.
import assert from 'node:assert/strict';
import {createHmac,webcrypto} from 'node:crypto';
import {onRequestGet,onRequestPost} from '../functions/api/premium.js';
import {onRequestPost as onIpn} from '../functions/api/nowpayments-ipn.js';
import {PRICE_USD} from '../functions/_lib/premium.js';
globalThis.crypto??=webcrypto;

const orders=new Map();
const invoices=new Map();
const attempts=new Map();
let minUsd=20, invoiceSeq=4299592143,providerStatus='waiting';
const db={prepare(sql){
 let args=[];
 const q={
  bind(...values){args=values;return q},
  async run(){
   if(sql.startsWith('CREATE TABLE')||sql.startsWith('CREATE INDEX')||
      sql.startsWith('ALTER TABLE')||sql.includes('SET\n    created_at_utc='))return {meta:{changes:0}};
   if(sql.startsWith('INSERT INTO premium_checkout_attempts')){
    const [id,session_id,provider,slug,currency,country,region,city,
     visitor_timezone,browser_timezone,created_ms,created_at_utc,created_at_ist]=args;
    attempts.set(id,{id,session_id,provider,slug,currency,country,region,city,
      visitor_timezone,browser_timezone,created_ms,created_at_utc,created_at_ist,status:'started'});
    return {meta:{changes:1}};
   }
   if(sql.startsWith('UPDATE premium_checkout_attempts')){
    const [status,orderId,errorCode,id]=args;
    const a=attempts.get(id);if(a)Object.assign(a,{status,orderId,errorCode});
    return {meta:{changes:a?1:0}};
   }
   if(sql.startsWith('INSERT INTO premium_nowpayments_orders')){
    const [id,secret_hash,slug,currency,amount_usd,created_ms,created_at_utc,created_at_ist,
     visitor_session_id,visitor_country,visitor_region,visitor_city,visitor_timezone,
     visitor_browser_timezone]=args;
    orders.set(id,{id,secret_hash,slug,currency,amount_usd,created_ms,created_at_utc,created_at_ist,
      visitor_session_id,visitor_country,visitor_region,visitor_city,visitor_timezone,
      visitor_browser_timezone,invoice_id:null,invoice_url:null,status:'creating',paid_ms:null,payment_id:null});
    return {meta:{changes:1}};
   }
   if(sql.startsWith("UPDATE premium_nowpayments_orders SET status='waiting'")){
    const [invoice_id,invoice_url,id]=args;
    const row=orders.get(id);
    if(!row||row.status!=='creating')return {meta:{changes:0}};
    row.invoice_id=invoice_id;row.invoice_url=invoice_url;row.status='waiting';return {meta:{changes:1}};
   }
   if(sql.startsWith("UPDATE premium_nowpayments_orders SET status='failed'")){
    const row=orders.get(args[0]);if(row)row.status='failed';
    return {meta:{changes:1}};
   }
   if(sql.startsWith("UPDATE premium_nowpayments_orders SET status='paid'")){
    const [payment_id,paid_ms,paid_at_utc,paid_at_ist,id,invoice_id]=args;
    const row=orders.get(id);
    if(!row||row.status!=='waiting'||String(row.invoice_id)!==invoice_id||
      [...orders.values()].some(x=>x.payment_id===payment_id))return {meta:{changes:0}};
    row.status='paid';row.payment_id=payment_id;row.paid_ms=paid_ms;
    row.paid_at_utc=paid_at_utc;row.paid_at_ist=paid_at_ist;
    return {meta:{changes:1}};
   }
   throw Error('Unexpected D1 run: '+sql);
  },
  async first(){
   if(sql.includes('WHERE id=? AND secret_hash=?')){
    const row=orders.get(args[0]);return row?.secret_hash===args[1]?row:null;
   }
   if(sql.includes('WHERE id=? AND invoice_id=?')){
    const row=orders.get(args[0]);return row?.invoice_id===args[1]?row:null;
   }
   if(sql.includes('SELECT status,payment_id FROM premium_nowpayments_orders WHERE id=')){
    const row=orders.get(args[0]);return row?{status:row.status,payment_id:row.payment_id}:null;
   }
   throw Error('Unexpected D1 SELECT: '+sql);
  }
 };
 return q;
}};
const file='//@version=6\nstrategy("Premium")';
const env={DB:db,PREMIUM_CHECKOUT_ENABLED:'true',NOWPAYMENTS_API_KEY:'test-api-key',
 NOWPAYMENTS_IPN_SECRET:'test-ipn-secret',NOWPAYMENTS_PAYOUT_CURRENCY:'trx',
 PREMIUM_BUCKET:{head:async()=>({size:100}),get:async()=>({body:file})}};
const validOrigin='https://signaltoscript.com';
const req=(action,data={},origin=validOrigin)=>{
 const request=new Request(validOrigin+'/api/premium',{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
  body:JSON.stringify({action,...data})
 });
 Object.defineProperty(request,'cf',{value:{country:'GB',region:'England',city:'London',timezone:'Europe/London'}});
 return request;
};
const post=(action,data={},environment=env)=>onRequestPost({request:req(action,data),env:environment});
function sorted(value){
 if(Array.isArray(value))return value.map(sorted);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sorted(value[k])]));
 return value;
}
const sign=payload=>createHmac('sha512',env.NOWPAYMENTS_IPN_SECRET).update(JSON.stringify(sorted(payload))).digest('hex');
const callback=(payload,signature=sign(payload))=>onIpn({env,request:new Request(validOrigin+'/api/nowpayments-ipn',{
 method:'POST',headers:{'Content-Type':'application/json','x-nowpayments-sig':signature},body:JSON.stringify(payload)
})});
function mockPayment(o,paymentId='123456789'){
 return {payment_id:paymentId,invoice_id:o.invoiceId,order_id:o.id,
  payment_status:providerStatus,price_amount:Number(PRICE_USD),price_currency:'usd',pay_currency:o.currency};
}
const originalFetch=globalThis.fetch;
globalThis.fetch=async (uri,opts={})=>{
 const url=String(uri);
 assert.equal(opts.headers['x-api-key'],'test-api-key');
 if(url.includes('/min-amount?'))return Response.json({min_amount:minUsd,fiat_equivalent:minUsd});
 if(url.endsWith('/invoice')&&opts.method==='POST'){
  const b=JSON.parse(opts.body);
  assert.equal(b.price_amount,Number(PRICE_USD));
  assert.equal(b.price_currency,'usd');
  assert.equal(b.ipn_callback_url,validOrigin+'/api/nowpayments-ipn');
  const id=String(++invoiceSeq);
  invoices.set(b.order_id,{id,currency:b.pay_currency});
  return Response.json({id,invoice_url:'https://nowpayments.io/payment/?iid='+id});
 }
 const paymentId=url.match(/\/payment\/(\d+)$/)?.[1];
 if(paymentId){
  const o=orders.values().next().value;
  const invoice=invoices.get(o.id);
  return Response.json({...mockPayment({id:o.id,invoiceId:invoice.id,currency:invoice.currency||'usdtbsc'},paymentId)});
 }
 throw Error('Unexpected NOWPayments URL '+url);
};
try{
 let result=await onRequestGet({env:{}});
 assert.equal((await result.json()).ready['gold-breakout-15m'],false);
 result=await post('create',{slug:'gold-breakout-15m',currency:'trx'},{...env,PREMIUM_CHECKOUT_ENABLED:'false'});
 assert.equal(result.status,503,'checkout off by default');
 result=await post('create',{slug:'gold-breakout-15m',currency:'trx'},{...env,PREMIUM_BUCKET:null});
 assert.equal(result.status,503,'must have private file');
 result=await post('create',{slug:'gold-breakout-15m',currency:'trx'});
 assert.equal(result.status,409,'provider minimum above 12.49 must block invoice');
 assert.equal(orders.size,0);
 minUsd=1;
 result=await post('create',{slug:'gold-breakout-15m',currency:'trx',price_amount:'0.01',
  sessionId:'923054b9-2465-443d-9719-61e0f37eef6a',browserTimezone:'Europe/London'});
 assert.equal(result.status,200);
 const first=(await result.json()).order;
 assert.equal(first.amountUsd,PRICE_USD);
 assert.match(first.createdAtUtc,/Z$|UTC$/);
 assert.match(first.createdAtSriLanka,/\+05:30$/);
 assert.equal([...attempts.values()].filter(a=>a.status==='minimum_blocked').length,1,'failed checkout attempt tracked');
 assert.equal([...attempts.values()].filter(a=>a.status==='invoice_created').length,1);
 assert.equal(first.currency,'auto','widget coin changes may still be verified');
 assert.equal(orders.get(first.id).visitor_country,'GB','Cloudflare country is stored');
 assert.equal(orders.get(first.id).visitor_region,'England','Cloudflare region is stored');
 assert.equal(orders.get(first.id).visitor_city,'London','Cloudflare city is stored');
 assert.equal(orders.get(first.id).visitor_browser_timezone,'Europe/London');
 assert.equal([...attempts.values()].find(a=>a.orderId===first.id).session_id,
  '923054b9-2465-443d-9719-61e0f37eef6a');
 assert.equal(invoices.get(first.id).currency,'trx','invoice remembers requested coin');
 assert.match(first.secret,/^[a-f0-9]{64}$/);
 assert.match(first.invoiceUrl,/^https:\/\/nowpayments\.io\/payment/);
 assert.equal(orders.size,1);
 result=await post('create',{slug:'supertrend-dema-reversal',currency:'ltc'});
 assert.equal(result.status,200,'second order does not need an amount lane');
 const second=(await result.json()).order;
 assert.notEqual(first.invoiceUrl,second.invoiceUrl);
 result=await post('create',{slug:'gold-breakout-15m',currency:'usdtbsc'});
 assert.equal(result.status,200,'USDT BSC default available');
 const bscOrder=(await result.json()).order;
 assert.equal(invoices.get(bscOrder.id).currency,'usdtbsc','preferred BSC sent to NOWPayments');
 assert.equal(bscOrder.currency,'auto','verify whatever valid payment coin widget ultimately uses');
 const auth={id:first.id,secret:first.secret};
 result=await post('download',auth);
 assert.equal(result.status,403,'prepaid file protected');
 result=await post('check',auth);
 assert.equal((await result.json()).order.status,'pending');
 result=await post('download',{id:first.id,secret:'0'.repeat(64)});
 assert.equal(result.status,403,'wrong browser receipt forbidden');
 const event=mockPayment({id:first.id,invoiceId:invoices.get(first.id).id,currency:'trx'});
 result=await callback(event,'0'.repeat(128));
 assert.equal(result.status,401,'forged webhook rejected');
 result=await callback({...event,payment_status:'confirmed'});
 assert.equal(result.status,200);
 assert.equal(orders.get(first.id).status,'waiting','confirming is not finished');
 providerStatus='confirmed';
 result=await callback({...event,payment_status:'finished'});
 assert.equal(result.status,422,'IPN not enough without provider finished status');
 providerStatus='finished';
 result=await callback({...event,payment_status:'finished'});
 assert.equal(result.status,200);
 assert.equal(orders.get(first.id).status,'paid');
 assert.match(orders.get(first.id).paid_at_ist,/\+05:30$/);
 result=await post('download',auth);
 assert.equal(result.status,200);
 assert.equal(await result.text(),file);
 assert.equal(first.slug,'lifetime');
 assert.equal((await post('download',{...auth,slug:'supertrend-dema-reversal'})).status,200);
 assert.equal((await post('download',{...auth,slug:'unknown'})).status,403);
 orders.get(first.id).slug='gold-breakout-15m';
 assert.equal((await post('download',{...auth,slug:'supertrend-dema-reversal'})).status,403);
 orders.get(first.id).slug='lifetime';
 result=await callback({...event,payment_status:'finished'});
 assert.equal(result.status,200,'duplicate notification idempotent');
 result=await post('check',auth);
 assert.equal((await result.json()).order.status,'paid');
 result=await onRequestPost({request:req('create',{slug:'gold-breakout-15m'},'https://bad.example'),env});
 assert.equal(result.status,403,'cross-origin checkout rejected');
 assert.equal(orders.get(second.id).status,'waiting','other buyer remains unpaid');
 console.log('NOWPayments tests passed: timestamps, attempts, minimum checks, unique invoices, signed IPN, provider confirmation, idempotency and private downloads.');
}finally{globalThis.fetch=originalFetch}
