// Premium product catalog, on-chain verification and D1 order helpers.
// No wallet seed/private key is ever used on this server.
import {randomToken,hashToken} from './download-access.js';

export const RECEIVER='TYemkXWco4P6h1UCVgvneiMhiVaDpqVBwq';
export const USDT='TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
export const OFFER_END=Date.parse('2026-12-01T00:00:00Z');
export const BASE_MICRO=1990000;
export const ORDER_LIFETIME_MS=30*60*1000;
export const LANE_COOLDOWN_MS=90*60*1000;
export const PRODUCTS=Object.freeze({
 'gold-breakout-15m':'Gold Breakout 15M Strategy',
 'supertrend-dema-reversal':'Supertrend + DEMA Reversal Strategy'
});
export const isPremium=slug=>Object.hasOwn(PRODUCTS,slug);
export const noCache=()=>({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
const TABLES=[
`CREATE TABLE IF NOT EXISTS premium_orders (
 id TEXT PRIMARY KEY,
 secret_hash TEXT NOT NULL UNIQUE,
 slug TEXT NOT NULL,
 amount_micro INTEGER NOT NULL,
 lane INTEGER NOT NULL,
 created_ms INTEGER NOT NULL,
 expires_ms INTEGER NOT NULL,
 paid_ms INTEGER,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid')),
 tx_hash TEXT UNIQUE
)`,
`CREATE INDEX IF NOT EXISTS idx_premium_orders_status ON premium_orders(status,expires_ms)`,
`CREATE TABLE IF NOT EXISTS premium_slots (
 lane INTEGER PRIMARY KEY CHECK(lane IN (0,1,2)),
 order_id TEXT,
 hold_until_ms INTEGER NOT NULL DEFAULT 0
)`
];
let initPromise;
export async function ensurePremiumSchema(db){
 if(!initPromise)initPromise=(async()=>{
  for(const statement of TABLES)await db.prepare(statement).run();
  for(let i=0;i<3;i++)await db.prepare('INSERT OR IGNORE INTO premium_slots(lane) VALUES (?)').bind(i).run();
 })();
 try{await initPromise}catch(error){initPromise=null;throw error}
}
export function goodCredential(token){return typeof token==='string'&&/^[0-9a-f]{64}$/.test(token)}
export async function fetchOrder(db,id,secret){
 if(!goodCredential(secret)||typeof id!=='string'||!/^[0-9a-f]{24}$/.test(id))return null;
 return db.prepare('SELECT * FROM premium_orders WHERE id=? AND secret_hash=? LIMIT 1')
  .bind(id,await hashToken(secret)).first();
}
export function orderResponse(row){
 return {id:row.id,slug:row.slug,product:PRODUCTS[row.slug],
  amount:(row.amount_micro/1000000).toFixed(3),amountMicro:row.amount_micro,
  createdAt:row.created_ms,expiresAt:row.expires_ms,
  status:row.status==='paid'?'paid':Date.now()>row.expires_ms?'expired':'pending',
  txHash:row.tx_hash||null,receiver:RECEIVER,network:'TRON (TRC20)',token:'USDT'};
}
export async function storageAvailable(env,slug){
 if(!env.PREMIUM_BUCKET||typeof env.PREMIUM_BUCKET.head!=='function')return false;
 return !!await env.PREMIUM_BUCKET.head(slug+'.pine');
}
export async function createOrder(db,slug,now=Date.now()){
 if(!isPremium(slug))return {error:'Unknown premium script',status:404};
 if(now>=OFFER_END)return {error:'The early Black Friday offer has ended. Checkout is paused until prices are updated.',status:409};
 await ensurePremiumSchema(db);
 const id=randomToken().slice(0,24),secret=randomToken();
 const expiry=now+ORDER_LIFETIME_MS,holdUntil=expiry+LANE_COOLDOWN_MS;
 for(let lane=0;lane<3;lane++){
  const claim=await db.prepare(
   'UPDATE premium_slots SET order_id=?,hold_until_ms=? WHERE lane=? AND hold_until_ms < ?'
  ).bind(id,holdUntil,lane,now).run();
  if(claim.meta?.changes!==1)continue;
  try{
   const amount=BASE_MICRO+1000*lane;
   await db.prepare(
    'INSERT INTO premium_orders(id,secret_hash,slug,amount_micro,lane,created_ms,expires_ms) VALUES(?,?,?,?,?,?,?)'
   ).bind(id,await hashToken(secret),slug,amount,lane,now,expiry).run();
   return {order:{id,secret,slug,product:PRODUCTS[slug],amount:(amount/1000000).toFixed(3),
    amountMicro:amount,createdAt:now,expiresAt:expiry,receiver:RECEIVER,
    network:'TRON (TRC20)',token:'USDT',status:'pending'}};
  }catch(error){
   await db.prepare('UPDATE premium_slots SET order_id=NULL,hold_until_ms=0 WHERE order_id=?').bind(id).run();
   throw error;
  }
 }
 return {status:429,error:'Three checkout amounts are temporarily reserved. Please try again later.'};
}
async function tronRequest(url,env,options={}){
 const headers={'Accept':'application/json',...(options.method==='POST'?{'Content-Type':'application/json'}:{})};
 if(env.TRONGRID_API_KEY)headers['TRON-PRO-API-KEY']=env.TRONGRID_API_KEY;
 const response=await fetch(url,{...options,headers,signal:AbortSignal.timeout(9000)});
 if(!response.ok)throw Error('TRON verification service unavailable ('+response.status+')');
 return response.json();
}
export async function locatePayment(row,env,txid=''){
 const hash=typeof txid==='string'?txid.trim().toLowerCase():'';
 if(hash&&!/^[0-9a-f]{64}$/.test(hash))return {code:'INVALID_HASH'};
 const query=new URL('https://api.trongrid.io/v1/accounts/'+RECEIVER+'/transactions/trc20');
 query.searchParams.set('only_confirmed','true');
 query.searchParams.set('only_to','true');
 query.searchParams.set('contract_address',USDT);
 query.searchParams.set('min_timestamp',String(row.created_ms));
 query.searchParams.set('limit','200');
 const candidates=[];
 let fingerprint='';
 for(let page=0;page<3;page++){
  if(fingerprint)query.searchParams.set('fingerprint',fingerprint);
  const history=await tronRequest(query.toString(),env);
  if(!Array.isArray(history.data))throw Error('Unexpected TRC20 history response');
  for(const transfer of history.data){
   const t=Number(transfer.block_timestamp);
   const id=String(transfer.transaction_id||'').toLowerCase();
   if(transfer.to!==RECEIVER||transfer.token_info?.address!==USDT||
      Number(transfer.token_info?.decimals)!==6||
      String(transfer.value)!==String(row.amount_micro)||
      !/^[0-9a-f]{64}$/.test(id)||
      !(t>=row.created_ms&&t<=row.expires_ms))continue;
   if(hash&&hash!==id)continue;
   if(!candidates.find(x=>x===id))candidates.push(id);
  }
  if(history.data.length<200||!history.meta?.fingerprint)break;
  fingerprint=history.meta.fingerprint;
 }
 if(!candidates.length)return {code:'NOT_FOUND'};
 if(candidates.length>1&&!hash)return {code:'AMBIGUOUS'};
 const candidate=candidates[0];
 const receipt=await tronRequest('https://api.trongrid.io/walletsolidity/gettransactioninfobyid',env,{
  method:'POST',body:JSON.stringify({value:candidate})
 });
 if(String(receipt.id||'').toLowerCase()!==candidate||receipt.receipt?.result!=='SUCCESS'||receipt.result==='FAILED')
  return {code:'NOT_CONFIRMED'};
 return {code:'CONFIRMED',txid:candidate};
}
export async function settleOrder(db,row,txid,now=Date.now()){
 // One confirmed transaction may unlock at most one paid order.
 try{
  const result=await db.prepare(
   "UPDATE premium_orders SET status='paid',tx_hash=?,paid_ms=? WHERE id=? AND status='pending' AND expires_ms>=? AND NOT EXISTS(SELECT 1 FROM premium_orders WHERE tx_hash=?)"
  ).bind(txid,now,row.id,now,txid).run();
  if(result.meta?.changes===1)return {paid:true};
 }catch(error){if(!/UNIQUE|constraint/i.test(String(error)))throw error}
 const updated=await db.prepare('SELECT status,tx_hash FROM premium_orders WHERE id=?').bind(row.id).first();
 return {paid:updated?.status==='paid'&&updated.tx_hash===txid};
}
