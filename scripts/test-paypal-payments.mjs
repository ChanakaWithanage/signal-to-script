// Offline tests: PayPal approval URL, server-side capture, one-time order receipt, R2 delivery.
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {onRequestPost} from '../functions/api/paypal.js';
import {PRICE_USD} from '../functions/_lib/premium.js';
globalThis.crypto??=webcrypto;
const originalFetch=globalThis.fetch,originalNow=Date.now;
Date.now=()=>Date.parse('2026-11-20T08:00:00.000Z');
const purchases=new Map(),attempts=new Map();
const db={prepare(sql){
 let args=[];const q={
  bind(...v){args=v;return q},
  async run(){
   if(sql.startsWith('CREATE TABLE')||sql.startsWith('CREATE INDEX'))return {meta:{changes:0}};
   if(sql.startsWith('INSERT INTO premium_checkout_attempts')){
    const [id,session_id,provider,slug,currency,country,region,city,time_zone,
     browser_zone,created_ms,utc,ist]=args;
    attempts.set(id,{id,provider,slug,currency,country,region,city,utc,ist,status:'started'});
    return {meta:{changes:1}};
   }
   if(sql.startsWith('UPDATE premium_checkout_attempts')){
    if(sql.includes("SET status='paid'")){
     for(const a of attempts.values())if(a.provider==='paypal')a.status='paid';
    }else{const [status,orderId,errorCode,id]=args;const a=attempts.get(id);
     if(a)Object.assign(a,{status,orderId,errorCode});}
    return {meta:{changes:1}};
   }
   if(sql.startsWith('INSERT INTO premium_paypal_orders')){
    const [id,secret_hash,slug,amount_usd,paypal_order_id,created_ms,created_at_utc,
     created_at_ist,visitor_session_id,visitor_country,visitor_region,visitor_city,
     visitor_timezone]=args;
    purchases.set(id,{id,secret_hash,slug,amount_usd,paypal_order_id,created_ms,
     created_at_utc,created_at_ist,visitor_session_id,visitor_country,visitor_region,
     visitor_city,visitor_timezone,status:'waiting'});
    return {meta:{changes:1}};
   }
   if(sql.startsWith('UPDATE premium_paypal_orders')){
    const [paypal_capture_id,paid_ms,paid_at_utc,paid_at_ist,id,paypal_order_id]=args;
    const row=purchases.get(id);
    if(!row||row.status!=='waiting'||row.paypal_order_id!==paypal_order_id)
     return {meta:{changes:0}};
    Object.assign(row,{status:'paid',paypal_capture_id,paid_ms,paid_at_utc,paid_at_ist});
    return {meta:{changes:1}};
   }
   throw Error('Unexpected D1 query: '+sql);
  },
  async first(){
   if(sql.startsWith('SELECT * FROM premium_paypal_orders WHERE id=? AND secret_hash=?')){
    const row=purchases.get(args[0]);return row?.secret_hash===args[1]?row:null;
   }
   throw Error('Unexpected D1 select: '+sql);
  }
 };return q;
}};
const file='//@version=6\nstrategy("Premium")';
const env={DB:db,PREMIUM_BUCKET:{head:async()=>({size:123}),get:async()=>({body:file})},
 PAYPAL_ENABLED:'true',PAYPAL_MODE:'sandbox',PAYPAL_CLIENT_ID:'client-id',
 PAYPAL_CLIENT_SECRET:'client-secret'};
const origin='https://signaltoscript.com';
const post=(action,fields={},environment=env)=>onRequestPost({env:environment,
 request:new Request(origin+'/api/paypal',{method:'POST',
  headers:{Origin:origin,'Content-Type':'application/json'},
  body:JSON.stringify({action,...fields})})});
const orderId='3NW12345678901234';
let captured=false;
globalThis.fetch=async (input,opts={})=>{
 const url=String(input);
 if(url.endsWith('/v1/oauth2/token'))return Response.json({access_token:'token'});
 if(url.endsWith('/v2/checkout/orders')&&opts.method==='POST'){
  const body=JSON.parse(opts.body);
  assert.equal(body.purchase_units[0].amount.value,PRICE_USD);
  assert.equal(body.purchase_units[0].amount.currency_code,'USD');
  return Response.json({id:orderId,links:[{rel:'approve',
   href:'https://www.sandbox.paypal.com/checkoutnow?token='+orderId}]});
 }
 if(url.endsWith('/v2/checkout/orders/'+orderId+'/capture')){
  captured=true;
  const row=[...purchases.values()][0];
  return Response.json({id:orderId,status:'COMPLETED',purchase_units:[{
   custom_id:row.id,reference_id:row.id,amount:{currency_code:'USD',value:PRICE_USD},
   payments:{captures:[{id:'ABC123456789',status:'COMPLETED',
    amount:{currency_code:'USD',value:PRICE_USD}}]}
  }]});
 }
 throw Error('Unexpected PayPal API '+url);
};
try{
 let resp=await post('create',{slug:'gold-breakout-15m'},{...env,PAYPAL_ENABLED:'false'});
 assert.equal(resp.status,503,'PayPal disabled until credentials enabled');
 resp=await post('create',{slug:'gold-breakout-15m',
  sessionId:'923054b9-2465-443d-9719-61e0f37eef6a'});
 assert.equal(resp.status,200,'creates hosted PayPal approval URL');
 const first=(await resp.json()).order;
 assert.match(first.secret,/^[a-f0-9]{64}$/);
 assert.equal(first.paypalOrderId,orderId);
 assert.equal(purchases.get(first.id).amount_usd,PRICE_USD);
 assert.match(purchases.get(first.id).created_at_ist,/\+05:30$/);
 assert.equal([...attempts.values()].some(x=>x.status==='order_created'),true);
 resp=await post('download',{id:first.id,secret:first.secret});
 assert.equal(resp.status,403,'download blocked until captured');
 resp=await post('capture',{id:first.id,secret:'0'.repeat(64),paypalOrderId:orderId});
 assert.equal(resp.status,403,'wrong receipt rejected');
 resp=await post('capture',{id:first.id,secret:first.secret,paypalOrderId:'BAD'});
 assert.equal(resp.status,403,'wrong PayPal order ID rejected');
 resp=await post('capture',{id:first.id,secret:first.secret,paypalOrderId:orderId});
 assert.equal(resp.status,200);
 assert.equal(captured,true);
 assert.equal((await resp.json()).order.status,'paid');
 assert.match(purchases.get(first.id).paid_at_utc,/Z$/);
 resp=await post('download',{id:first.id,secret:first.secret});
 assert.equal(resp.status,200);
 assert.equal(await resp.text(),file);
 resp=await post('capture',{id:first.id,secret:first.secret,paypalOrderId:orderId});
 assert.equal(resp.status,200,'repeated capture is idempotent');
 console.log('PayPal checkout tests passed: gated settings, USD amount, timestamps, secure capture and R2 download.');
}finally{globalThis.fetch=originalFetch;Date.now=originalNow}
