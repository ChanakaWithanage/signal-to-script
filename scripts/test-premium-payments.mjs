// Offline end-to-end payment safety tests with mocked D1, R2 and TronGrid.
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {onRequestPost,onRequestGet} from '../functions/api/premium.js';
import {RECEIVER,USDT,settleOrder,locatePayment} from '../functions/_lib/premium.js';
globalThis.crypto??=webcrypto;

const orders=new Map(),slots=new Map();
const db={
 prepare(sql){
  let args=[];const statement={
   bind(...values){args=values;return statement},
   async run(){
    if(sql.startsWith('CREATE TABLE')||sql.startsWith('CREATE INDEX'))return {meta:{changes:0}};
    if(sql.startsWith('INSERT OR IGNORE INTO premium_slots')){
     if(!slots.has(args[0]))slots.set(args[0],{id:null,until:0});
     return {meta:{changes:1}};
    }
    if(sql.startsWith('UPDATE premium_slots SET order_id=?,hold_until_ms=?')){
     const [id,until,lane,now]=args;
     const slot=slots.get(lane);
     if(!slot||slot.until>=now)return {meta:{changes:0}};
     slots.set(lane,{id,until});return {meta:{changes:1}};
    }
    if(sql.startsWith('UPDATE premium_slots SET order_id=NULL')){
     for(const [lane,item] of slots)if(item.id===args[0])slots.set(lane,{id:null,until:0});
     return {meta:{changes:1}};
    }
    if(sql.startsWith('INSERT INTO premium_orders')){
     const [id,secret_hash,slug,amount_micro,lane,created_ms,expires_ms]=args;
     orders.set(id,{id,secret_hash,slug,amount_micro,lane,created_ms,expires_ms,status:'pending',tx_hash:null,paid_ms:null});
     return {meta:{changes:1}};
    }
    if(sql.startsWith('UPDATE premium_orders SET status=')){
     const [txid,paid_ms,id,now]=args;
     const row=orders.get(id);
     if(!row||row.status!=='pending'||row.expires_ms<now||[...orders.values()].some(x=>x.tx_hash===txid))
      return {meta:{changes:0}};
     row.status='paid';row.tx_hash=txid;row.paid_ms=paid_ms;
     return {meta:{changes:1}};
    }
    throw Error('Unhandled D1 run: '+sql);
   },
   async first(){
    if(sql.startsWith('SELECT * FROM premium_orders WHERE id=')){
     const o=orders.get(args[0]);
     return o?.secret_hash===args[1]?o:null;
    }
    if(sql.startsWith('SELECT status,tx_hash FROM premium_orders')){
     const o=orders.get(args[0]);
     return o?{status:o.status,tx_hash:o.tx_hash}:null;
    }
    throw Error('Unhandled D1 SELECT: '+sql);
   }
  };
  return statement;
 }
};
const file='//@version=6\nstrategy("Premium test")';
const env={DB:db,PREMIUM_BUCKET:{
 head:async name=>name.endsWith('.pine')?{size:file.length}:null,
 get:async name=>name.endsWith('.pine')?{body:file}:null
}};
function request(action,more={},origin='https://signaltoscript.com'){
 return new Request('https://signaltoscript.com/api/premium',{
  method:'POST',
  headers:{'Content-Type':'application/json',Origin:origin},
  body:JSON.stringify({action,...more})
 });
}
const post=(action,more={},e=env)=>onRequestPost({request:request(action,more),env:e});

const metadata=await onRequestGet({env:{}});
assert.equal((await metadata.json()).ready['gold-breakout-15m'],false,'no R2 means checkout unready');
const blocked=await post('create',{slug:'gold-breakout-15m'},{DB:db});
assert.equal(blocked.status,503,'no payment reservation without private R2');

const slugs=['gold-breakout-15m','supertrend-dema-reversal','gold-breakout-15m'];
const purchases=[];
for(let i=0;i<3;i++){
 const r=await post('create',{slug:slugs[i]});
 assert.equal(r.status,200);
 const x=(await r.json()).order;
 assert.equal(x.amount,(1.990+i*.001).toFixed(3));
 assert.match(x.secret,/^[0-9a-f]{64}$/);
 purchases.push(x);
}
const fourth=await post('create',{slug:'gold-breakout-15m'});
assert.equal(fourth.status,429,'all three distinct amounts are reserved');
const one=purchases[0];
const body={id:one.id,secret:one.secret};
const notPaid=await post('download',body);
assert.equal(notPaid.status,403,'paid source must be inaccessible before confirmation');

const TX='e'.repeat(64);
const later=one.createdAt+15000;
let incoming=[{transaction_id:TX,block_timestamp:later,to:RECEIVER,token_info:{address:USDT,decimals:6},value:String(one.amountMicro)}];
let receiptStatus='SUCCESS';
const originalFetch=globalThis.fetch;
globalThis.fetch=async (url,options={})=>{
 const u=String(url);
 if(u.includes('/transactions/trc20')){
  assert.match(u,/only_confirmed=true/);
  return Response.json({data:incoming,meta:{}});
 }
 if(u.endsWith('/walletsolidity/gettransactioninfobyid')){
  assert.equal(JSON.parse(options.body).value,TX);
  return Response.json({id:TX,receipt:{result:receiptStatus}});
 }
 throw Error('Unexpected provider URL '+u);
};
try{
 incoming=[{...incoming[0],value:'1991000'}];
 assert.equal((await locatePayment(orders.get(one.id),env)).code,'NOT_FOUND','wrong amount must not credit');
 incoming=[{...incoming[0],value:String(one.amountMicro),token_info:{address:'FAKE',decimals:6}}];
 assert.equal((await locatePayment(orders.get(one.id),env)).code,'NOT_FOUND','fake token must not credit');
 incoming=[{...incoming[0],token_info:{address:USDT,decimals:6},to:'NotTheWallet'}];
 assert.equal((await locatePayment(orders.get(one.id),env)).code,'NOT_FOUND','wrong receiver must not credit');
 incoming=[{...incoming[0],to:RECEIVER,block_timestamp:one.createdAt-10}];
 assert.equal((await locatePayment(orders.get(one.id),env)).code,'NOT_FOUND','old transfer must not count');
 incoming=[{...incoming[0],block_timestamp:later}];
 receiptStatus='REVERT';
 assert.equal((await locatePayment(orders.get(one.id),env)).code,'NOT_CONFIRMED','reverted tx must not credit');
 receiptStatus='SUCCESS';
 const paid=await post('check',body);
 assert.equal(paid.status,200);
 assert.equal((await paid.json()).order.status,'paid','confirmed payment unlocks the order');
 const delivery=await post('download',body);
 assert.equal(delivery.status,200);
 assert.equal(await delivery.text(),file);
 assert.match(delivery.headers.get('Content-Disposition'),/gold-breakout-15m.pine/);
 const replay=await settleOrder(db,orders.get(purchases[1].id),TX);
 assert.equal(replay.paid,false,'transaction hash cannot unlock another order');
 const wrongSecret=await post('download',{id:one.id,secret:'0'.repeat(64)});
 assert.equal(wrongSecret.status,403,'order download requires buyer capability');
 const wrongOrigin=await onRequestPost({request:request('create',{slug:'gold-breakout-15m'},'https://attacker.example'),env});
 assert.equal(wrongOrigin.status,403,'cross-origin checkout must fail');
}finally{globalThis.fetch=originalFetch}
console.log('Premium USDT tests passed: three payment lanes, no-storage lock, token/amount/receipt checks, replay and private delivery.');
