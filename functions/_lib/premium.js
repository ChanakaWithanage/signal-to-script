// Premium downloads via a NOWPayments widget, with a distinct invoice for each buyer.
import {randomToken,hashToken} from './download-access.js';
import {utcTime,sriLankaTime,ensureCheckoutTracking} from './checkout-tracking.js';

// Ongoing founder launch: trial members can upgrade after their seven-day evaluation.
export const OFFER_END=Number.POSITIVE_INFINITY;
export const PRICE_USD='12.99';
export const MEMBERSHIP='lifetime';
export const MEMBERSHIP_NAME='Signal to Script Lifetime Membership';
export const PRODUCTS=Object.freeze({
 'portfolio-trend-dashboard':'Portfolio Trend Dashboard',
 'gold-breakout-15m':'Gold Breakout 15M Strategy',
 'supertrend-dema-reversal':'Supertrend + DEMA Reversal Strategy',
 'sp500-opening-range-breakout-15m':'S&P 500 Opening Range Breakout 15M'
});
export const CURRENCIES=Object.freeze(['trx','ltc','usdttrc20','usdtbsc']);
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
 created_at_utc TEXT, created_at_ist TEXT,
 paid_ms INTEGER, paid_at_utc TEXT, paid_at_ist TEXT,
 visitor_session_id TEXT, visitor_country TEXT, visitor_region TEXT,
 visitor_city TEXT, visitor_timezone TEXT, visitor_browser_timezone TEXT,
 payment_id TEXT UNIQUE
)`,
`CREATE INDEX IF NOT EXISTS idx_np_invoice ON premium_nowpayments_orders(invoice_id)`
];
let init;
export async function ensurePremiumSchema(db){
 if(!init)init=(async()=>{
  for(const sql of TABLES)await db.prepare(sql).run();
  // Upgrade old D1 tables in place; existing order IDs, receipts and payments are retained.
  for(const col of ['created_at_utc','created_at_ist','paid_at_utc','paid_at_ist',
   'visitor_session_id','visitor_country','visitor_region','visitor_city',
   'visitor_timezone','visitor_browser_timezone']){
   try{await db.prepare('ALTER TABLE premium_nowpayments_orders ADD COLUMN '+col+' TEXT').run()}
   catch(e){if(!/duplicate column name/i.test(String(e)))throw e}
  }
  // Readable historical timestamps for invoices created before the upgrade.
  await db.prepare(`UPDATE premium_nowpayments_orders SET
    created_at_utc=COALESCE(created_at_utc,datetime(created_ms/1000,'unixepoch')||' UTC'),
    created_at_ist=COALESCE(created_at_ist,datetime(created_ms/1000,'unixepoch','+5 hours','+30 minutes')||' +05:30'),
    paid_at_utc=COALESCE(paid_at_utc,CASE WHEN paid_ms IS NOT NULL THEN datetime(paid_ms/1000,'unixepoch')||' UTC' END),
    paid_at_ist=COALESCE(paid_at_ist,CASE WHEN paid_ms IS NOT NULL THEN datetime(paid_ms/1000,'unixepoch','+5 hours','+30 minutes')||' +05:30' END)
    WHERE created_at_utc IS NULL OR created_at_ist IS NULL OR (paid_ms IS NOT NULL AND paid_at_utc IS NULL)`).run();
  await ensureCheckoutTracking(db);
 })();
 try{await init}catch(error){init=null;throw error}
}
export function ready(env){
 return env.PREMIUM_CHECKOUT_ENABLED==='true'&&!!env.DB&&
  !!env.NOWPAYMENTS_API_KEY&&!!env.NOWPAYMENTS_IPN_SECRET&&!!env.PREMIUM_BUCKET&&!!env.NOWPAYMENTS_PAYOUT_CURRENCY;
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
 return {id:row.id,slug:row.slug,product:row.slug===MEMBERSHIP?MEMBERSHIP_NAME:PRODUCTS[row.slug],
  amountUsd:row.amount_usd,currency:row.currency,
  status:row.status==='paid'?'paid':row.status==='failed'?'failed':'pending',
  createdAt:row.created_ms,createdAtUtc:row.created_at_utc||utcTime(row.created_ms),
  createdAtSriLanka:row.created_at_ist||sriLankaTime(row.created_ms),
  invoiceId:row.invoice_id||null,invoiceUrl:row.invoice_url||null};
}
export function createCredentials(slug,currency){
 if(!isPremium(slug)||(currency!=='auto'&&!CURRENCIES.includes(currency)))throw Error('Unknown premium product or coin');
 return {id:randomToken().slice(0,24),secret:randomToken(),slug,currency,
  amountUsd:PRICE_USD,createdAt:Date.now()};
}
export async function provider(env,endpoint,options={}){
 const result=await fetch('https://api.nowpayments.io/v1/'+endpoint,{
  method:options.method||'GET',
  headers:{'x-api-key':env.NOWPAYMENTS_API_KEY,'Accept':'application/json',
   ...(options.body?{'Content-Type':'application/json'}:{})},
  ...(options.body?{body:JSON.stringify(options.body)}:{}),
  signal:AbortSignal.timeout(options.timeoutMs||8500)
 });
 if(!result.ok)throw new Error('NOWPayments returned HTTP '+result.status);
 return result.json();
}
export async function checkMinimum(env,currency){
 if(!CURRENCIES.includes(currency))return {ok:false,error:'Unsupported currency.'};
 // Compare the provider's real-time fiat-equivalent minimum before issuing an invoice.
 // Payout currency is configured in the merchant account; this must match its settings.
 const payout=String(env.NOWPAYMENTS_PAYOUT_CURRENCY||'').toLowerCase();
 if(!payout)return {ok:false,error:'Merchant payout currency has not been configured.'};
 const data=await provider(env,'min-amount?currency_from='+encodeURIComponent(currency)+
  '&currency_to='+encodeURIComponent(payout)+'&fiat_equivalent=usd');
 const minimum=Number(data.fiat_equivalent);
 if(!Number.isFinite(minimum)||minimum<=0)
  return {ok:false,error:'NOWPayments did not return a reliable USD minimum. Checkout is unavailable for this currency.'};
 if(minimum>Number(PRICE_USD))
  return {ok:false,error:'NOWPayments currently requires approximately $'+minimum.toFixed(2)+
   ' for '+currency.toUpperCase()+'. The $12.99 launch price is below that minimum. Choose another coin.'};
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
  /^[a-z0-9]{2,30}$/i.test(String(p.pay_currency||''))&&
  (row.currency==='auto'||String(p.pay_currency||'').toLowerCase()===row.currency);
}
export async function settlePayment(db,row,p){
 if(!matchesPayment(row,p))return false;
 try{
  const result=await db.prepare(
   "UPDATE premium_nowpayments_orders SET status='paid',payment_id=?,paid_ms=?,paid_at_utc=?,paid_at_ist=? WHERE id=? AND invoice_id=? AND status='waiting' AND NOT EXISTS(SELECT 1 FROM premium_nowpayments_orders WHERE payment_id=?)"
  ).bind(String(p.payment_id),Date.now(),utcTime(Date.now()),sriLankaTime(Date.now()),row.id,String(row.invoice_id),String(p.payment_id)).run();
  if(result.meta?.changes===1)return true;
 }catch(error){if(!/unique|constraint/i.test(String(error)))throw error}
 const current=await db.prepare('SELECT status,payment_id FROM premium_nowpayments_orders WHERE id=?').bind(row.id).first();
 return current?.status==='paid'&&current.payment_id===String(p.payment_id);
}
