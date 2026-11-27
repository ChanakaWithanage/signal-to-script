import test from 'node:test';
import assert from 'node:assert/strict';
import {CRYPTO_COINS,paymentReady,validInvoiceUrl,verifiedSignature,paymentMatches,
 encryptCode,decryptCode,fulfillOrder} from '../functions/_lib/crypto.js';
import {onRequestPost as cryptoIPN} from '../functions/api/crypto-ipn.js';
import {onRequestPost as cryptoCreate} from '../functions/api/crypto.js';
const order={
 id:'a'.repeat(24),email:'vip@example.com',plan:'weekly',amount_usd:'4.99',currency:'auto',
 invoice_id:'123456789',invoice_url:'https://nowpayments.io/payment/?x=1',
 status:'waiting',payment_id:null,provisioned_ms:null
};
const event={
 payment_status:'finished',payment_id:'987654321',order_id:order.id,
 invoice_id:order.invoice_id,price_currency:'usd',price_amount:4.99,pay_currency:'usdtbsc'
};
async function signature(value,secret){
 const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?
  Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
  {name:'HMAC',hash:'SHA-512'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,
  new TextEncoder().encode(JSON.stringify(sort(value))))),b=>b.toString(16).padStart(2,'0')).join('');
}
test('Crypto checkout fails closed unless API, signing, payout and code encryption are configured',()=>{
 const env={DB:{},GOLD_CRYPTO_ENABLED:'true',NOWPAYMENTS_API_KEY:'test',
  NOWPAYMENTS_IPN_SECRET:'test',NOWPAYMENTS_PAYOUT_CURRENCY:'usdtbsc'};
 assert.equal(paymentReady(env),false);
 assert.equal(paymentReady({...env,GOLD_CRYPTO_CODE_KEY:'ab'.repeat(32)}),true);
 assert.ok(CRYPTO_COINS.includes('usdtbsc'));
 assert.equal(validInvoiceUrl('https://nowpayments.io/abc'),true);
 assert.equal(validInvoiceUrl('https://nowpayments.io.evil.example/payment'),false);
 assert.equal(validInvoiceUrl('http://nowpayments.io/payment'),false);
});
test('Payment signature requires the correct secret and canonical field ordering',async()=>{
 const secret='ipn-testing';
 const sig=await signature(event,secret);
 assert.equal(await verifiedSignature(event,sig,secret),true);
 assert.equal(await verifiedSignature({...event,price_amount:999},sig,secret),false);
 assert.equal(await verifiedSignature(event,sig,'wrong'),false);
 assert.equal(await verifiedSignature(event,'not-a-signature',secret),false);
});
test('Only finished invoices matching order, amount, invoice and currency qualify',()=>{
 assert.equal(paymentMatches(order,event),true);
 for(const modified of [
  {...event,payment_status:'confirmed'},
  {...event,payment_status:'partially_paid'},
  {...event,price_amount:0},
  {...event,invoice_id:'9999999'},
  {...event,order_id:'b'.repeat(24)},
  {...event,price_currency:'eur'},
  {...event,payment_id:'not-numeric'},
 ]){
  assert.equal(paymentMatches(order,modified),false,JSON.stringify(modified));
 }
});
test('Member codes are encrypted in D1 rather than stored in plaintext',async()=>{
 const key='ab'.repeat(32),plain='GOLD-1234-5678-90AB';
 const cipher=await encryptCode(plain,key);
 assert.notEqual(cipher,plain);
 assert.equal(await decryptCode(cipher,key),plain);
 assert.equal(await decryptCode(cipher,'cd'.repeat(32)),null);
});
test('Unconfigured or forged crypto requests cannot take money or unlock VIP access',async()=>{
 const origin='https://gold.signaltoscript.com';
 const create=await cryptoCreate({request:new Request(origin+'/api/crypto',{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
  body:JSON.stringify({email:'vip@example.com',plan:'weekly',coin:'auto'})
 }),env:{DB:{}}});
 assert.equal(create.status,503);
 const invalid=await cryptoIPN({request:new Request(origin+'/api/crypto-ipn',{
  method:'POST',headers:{'Content-Type':'application/json','x-nowpayments-sig':'a'.repeat(128)},
  body:JSON.stringify(event)
 }),env:{DB:{},GOLD_CRYPTO_ENABLED:'true',NOWPAYMENTS_API_KEY:'key',NOWPAYMENTS_IPN_SECRET:'ipn-testing',
  NOWPAYMENTS_PAYOUT_CURRENCY:'usdtbsc',GOLD_CRYPTO_CODE_KEY:'ab'.repeat(32)}});
 assert.equal(invalid.status,401);
});
test('Provider-confirmed paid invoice creates an encrypted 7-day membership only once',async()=>{
 const originalFetch=globalThis.fetch;
 const dbOrder={...order};
 const members=new Map(),issuedCodes=[];
 const db={prepare(sql){
  let args=[];
  return {
   bind(...a){args=a;return this},
   async all(){return {results:[{name:'plan'}]}},
   async first(){
    if(sql.includes('gold_crypto_orders'))return dbOrder;
    if(sql.includes('access_until_ms FROM memberships'))
     return members.has(args[0])?{access_until_ms:members.get(args[0])}:null;
    return null;
   },
   async run(){
    if(sql.includes("SET status='paid'")&&sql.includes('gold_crypto_orders')){
     if(dbOrder.status!=='waiting')return {meta:{changes:0}};
     dbOrder.status='paid';dbOrder.payment_id=args[0];return {meta:{changes:1}};
    }
    if(sql.includes("SET status='fulfilling'")){
     if(dbOrder.status!=='paid')return {meta:{changes:0}};
     dbOrder.status='fulfilling';return {meta:{changes:1}};
    }
    return {meta:{changes:1}};
   }
  };
 },async batch(stmts){
  for(const st of stmts){
   if(st.sql.includes('INSERT INTO memberships'))members.set(st.args[0],st.args[2]);
   if(st.sql.includes('INSERT INTO membership_codes'))issuedCodes.push(st.args);
   if(st.sql.includes("SET status='complete'")){
    dbOrder.status='complete';dbOrder.code_cipher=st.args[0];
    dbOrder.code_hash=st.args[1];dbOrder.provisioned_ms=st.args[2];dbOrder.expires_ms=st.args[3];
   }
  }
 }};
 const secret='ipn-testing',env={DB:db,GOLD_CRYPTO_ENABLED:'true',
  NOWPAYMENTS_API_KEY:'provider-key',NOWPAYMENTS_IPN_SECRET:secret,
  NOWPAYMENTS_PAYOUT_CURRENCY:'usdtbsc',GOLD_CRYPTO_CODE_KEY:'ab'.repeat(32)};
 globalThis.fetch=async url=>{
  if(String(url).includes('/payment/987654321'))
   return {ok:true,json:async()=>event};
  throw Error('Unexpected fetch '+url);
 };
 try{
  const ipn=new Request('https://gold.signaltoscript.com/api/crypto-ipn',{
   method:'POST',headers:{'Content-Type':'application/json','x-nowpayments-sig':await signature(event,secret)},
   body:JSON.stringify(event)
  });
  const first=await cryptoIPN({request:ipn,env});
  assert.equal(first.status,200);
  assert.equal(dbOrder.status,'complete');
  assert.equal(issuedCodes.length,1);
  const expiry=members.get(order.email);
  assert.ok(expiry>Date.now()+6.99*86400000);
  assert.ok(expiry<Date.now()+7.01*86400000);
  assert.ok((await decryptCode(dbOrder.code_cipher,env.GOLD_CRYPTO_CODE_KEY)).startsWith('GOLD-'));
  const second=await cryptoIPN({request:new Request(ipn.url,{
   method:'POST',headers:{'Content-Type':'application/json','x-nowpayments-sig':await signature(event,secret)},
   body:JSON.stringify(event)
  }),env});
  assert.equal(second.status,200);
  assert.equal(issuedCodes.length,1);
  assert.equal(members.get(order.email),expiry);
 }finally{globalThis.fetch=originalFetch}
});
