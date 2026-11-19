// Premium downloads with per-order NOWPayments hosted crypto invoices.
import {randomToken,hashToken} from './download-access.js';

export const OFFER_END=Date.parse('2026-12-01T00:00:00Z');
export const PRICE_USD='1.99';
export const PRODUCTS=Object.freeze({
 'gold-breakout-15m':'Gold Breakout 15M Strategy',
 'supertrend-dema-reversal':'Supertrend + DEMA Reversal Strategy'
});
export const CURRENCIES=Object.freeze(['trx','ltc','usdttrc20']);
export const isPremium=slug=>Object.hasOwn(PRODUCTS,slug);
export const noCache=()=>({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
const TABLES=[
`CREATE TABLE IF NOT EXISTS premium_nowpayments_orders (
 id TEXT PRIMARY KEY,
 secret_hash TEXT NOT NULL UNIQUE,
 slug TEXT NOT NULL,
 currency TEXT NOT NULL,
 amount_usd TEXT NOT NULL,
 invoice_id TEXT UNIQUE,
 invoice_url TEXT,
 status TEXT NOT NULL DEFAULT 'creating' CHECK(status IN ('creating','waiting','paid','failed')),
 created_ms INTEGER NOT NULL,
 paid_ms INTEGER,
 payment_id TEXT UNIQUE
)`,
`CREATE INDEX IF NOT EXISTS idx_np_invoice ON premium_nowpayments_orders(invoice_id)`
];
let init;
export async function ensurePremiumSchema(db){
 if(!init)init=(async()=>{for(const sql of TABLES)await db.prepare(sql).run()})();
 try{await init}catch(error){init=null;throw error}
}
export function ready(env){
 return env.PREMIUM_CHECKOUT_ENABLED==='true'&&!!env.DB&&
  !!env.NOWPAYMENTS_API_KEY&&!!env.NOWPAYMENTS_IPN_SECRET&&!!env.PREMIUM_BUCKET;
}
export async function storageAvailable(env,slug){
 if(!env.PREMIUM_BUCKET||typeof env.PREMIUM_BUCKET.head!=='function')return false;
 return !!await env.PREMIUM_BUCKET.head(slug+'.pine');
}
export function validToken(value){return typeof value==='string'&&/^[0-9a-f]{64}$/.test(value)}
export async function lookupOrder(db,id,secret){
 if(typeof id!=='string'||!/^[0-9a-f]{24}$/.test(id)||!validToken(secret))return null;
 return db.prepare('SELECT * FROM premium_nowpayments_orders WHERE id=? AND secret_hash=? LIMIT 1')
  .bind(id,await hashToken(secret)).first();
}
export function publicOrder(row){
 return {id:row.id,slug:row.slug,product:PRODUCTS[row.slug],
  amountUsd:row.amount_usd,currency:row.currency,
  status:row.status==='paid'?'paid':row.status==='failed'?'failed':'pending',
  createdAt:row.created_ms,invoiceUrl:row.invoice_url||null};
}
export function createCredentials(slug,currency){
 if(!isPremium(slug)||!CURRENCIES.includes(currency))throw Error('Unknown premium product or coin');
 return {id:randomToken().slice(0,24),secret:randomToken(),slug,currency,
  amountUsd:PRICE_USD,createdAt:Date.now()};
}
export async function provider(env,endpoint,options={}){
 const result=await fetch('https://api.nowpayments.io/v1/'+endpoint,{
  method:options.method||'GET',
  headers:{'x-api-key':env.NOWPAYMENTS_API_KEY,'Accept':'application/json',
   ...(options.body?{'Content-Type':'application/json'}:{})},
  ...(options.body?{body:JSON.stringify(options.body)}:{}),
  signal:AbortSignal.timeout(8500)
 });
 if(!result.ok)throw new Error('NOWPayments returned HTTP '+result.status);
 return result.json();
}
export async function checkMinimum(env,currency){
 if(!CURRENCIES.includes(currency))return {ok:false,error:'Unsupported currency.'};
 // Compare the provider's real-time fiat-equivalent minimum before issuing an invoice.
 // Payout currency is configured in the merchant account; this must match its settings.
 const payout=String(env.NOWPAYMENTS_PAYOUT_CURRENCY||'usdttrc20').toLowerCase();
 const data=await provider(env,'min-amount?currency_from='+encodeURIComponent(currency)+
  '&currency_to='+encodeURIComponent(payout)+'&fiat_equivalent=usd');
 const minimum=Number(data.fiat_equivalent);
 if(!Number.isFinite(minimum)||minimum<=0)
  return {ok:false,error:'NOWPayments did not return a reliable USD minimum. Checkout is unavailable for this currency.'};
 if(minimum>Number(PRICE_USD))
  return {ok:false,error:'NOWPayments currently requires approximately $'+minimum.toFixed(2)+
   ' for '+currency.toUpperCase()+'. The $1.99 launch price is below that minimum. Choose another coin.'};
 return {ok:true,minimumUsd:minimum};
}
export function validInvoiceUrl(value){
 try{const url=new URL(value);return url.protocol==='https:'&&
  (url.hostname==='nowpayments.io'||url.hostname.endsWith('.nowpayments.io'))}
 catch{return false}
}
function sortKeys(value){
 if(Array.isArray(value))return value.map(sortKeys);
 if(value&&typeof value==='object')
  return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sortKeys(value[k])]));
 return value;
}
export async function validateSignature(payload,signature,secret){
 if(!secret||typeof signature!=='string'||!/^[a-f0-9]{128}$/i.test(signature))return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret.trim()),
  {name:'HMAC',hash:'SHA-512'},false,['verify']);
 const bytes=new Uint8Array(signature.match(/../g).map(s=>parseInt(s,16)));
 return crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(JSON.stringify(sortKeys(payload))));
}
export function matchesPayment(row,p){
 // Do not treat "confirmed" or "partially_paid" as completed delivery.
 return String(p.payment_status).toLowerCase()==='finished'&&
  String(p.payment_id||'')!==''&&
  String(p.order_id||'')===row.id&&
  String(p.invoice_id||'')===String(row.invoice_id||'')&&
  String(p.price_currency||'').toLowerCase()==='usd'&&
  Math.abs(Number(p.price_amount)-Number(row.amount_usd))<0.000001&&
  String(p.pay_currency||'').toLowerCase()===row.currency;
}
export async function settlePayment(db,row,p){
 if(!matchesPayment(row,p))return false;
 try{
  const result=await db.prepare(
   "UPDATE premium_nowpayments_orders SET status='paid',payment_id=?,paid_ms=? WHERE id=? AND invoice_id=? AND status='waiting' AND NOT EXISTS(SELECT 1 FROM premium_nowpayments_orders WHERE payment_id=?)"
  ).bind(String(p.payment_id),Date.now(),row.id,String(row.invoice_id),String(p.payment_id)).run();
  if(result.meta?.changes===1)return true;
 }catch(error){if(!/unique|constraint/i.test(String(error)))throw error}
 const current=await db.prepare('SELECT status,payment_id FROM premium_nowpayments_orders WHERE id=?').bind(row.id).first();
 return current?.status==='paid'&&current.payment_id===String(p.payment_id);
}
