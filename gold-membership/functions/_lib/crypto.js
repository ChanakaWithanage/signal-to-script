import {digest,generatedCode,normalizedCode,DAY,mail} from './access.js';
import {planOf} from './plans.js';

export const CRYPTO_COINS=Object.freeze(['auto','usdtbsc','usdttrc20','ltc','trx']);
export const paymentReady=env=>!!(env.DB&&env.GOLD_CRYPTO_ENABLED==='true'&&env.NOWPAYMENTS_API_KEY&&env.NOWPAYMENTS_IPN_SECRET&&env.NOWPAYMENTS_PAYOUT_CURRENCY&&/^[a-f0-9]{64}$/i.test(env.GOLD_CRYPTO_CODE_KEY||''));
export const validOrderId=id=>typeof id==='string'&&/^[a-f0-9]{24}$/.test(id);
export const validOrderSecret=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
export const validInvoiceUrl=s=>{try{const u=new URL(s);return u.protocol==='https:'&&(u.hostname==='nowpayments.io'||u.hostname.endsWith('.nowpayments.io'))&&u.username===''&&u.password===''}catch{return false}};
export async function ensureCryptoSchema(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS gold_crypto_orders(id TEXT PRIMARY KEY,secret_hash TEXT UNIQUE NOT NULL,email TEXT NOT NULL,plan TEXT NOT NULL,amount_usd TEXT NOT NULL,currency TEXT NOT NULL,invoice_id TEXT UNIQUE,invoice_url TEXT,status TEXT NOT NULL DEFAULT 'creating',payment_id TEXT UNIQUE,created_ms INTEGER NOT NULL,paid_ms INTEGER,provisioned_ms INTEGER,expires_ms INTEGER,code_cipher TEXT,code_hash TEXT)").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS gold_crypto_recent ON gold_crypto_orders(created_ms DESC)").run();
}
export async function paymentProvider(env,path,options={}){
 const res=await fetch('https://api.nowpayments.io/v1/'+path,{method:options.method||'GET',
  headers:{'x-api-key':env.NOWPAYMENTS_API_KEY,Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},
  ...(options.body?{body:JSON.stringify(options.body)}:{}),signal:AbortSignal.timeout(options.timeoutMs||9000)});
 if(!res.ok)throw Error('NOWPayments HTTP '+res.status);
 return res.json();
}
export async function minimumSupported(env,coin,amountUsd){
 if(coin==='auto')return {ok:true};
 if(!CRYPTO_COINS.includes(coin))return {ok:false,message:'Unsupported cryptocurrency.'};
 const payout=String(env.NOWPAYMENTS_PAYOUT_CURRENCY||'').toLowerCase();
 if(!/^[a-z0-9]{2,20}$/.test(payout))return {ok:false,message:'Crypto payout currency is not configured.'};
 const data=await paymentProvider(env,'min-amount?currency_from='+encodeURIComponent(coin)+'&currency_to='+encodeURIComponent(payout)+'&fiat_equivalent=usd');
 const minimum=Number(data.fiat_equivalent);
 if(!Number.isFinite(minimum)||minimum<=0)return {ok:false,message:'Could not verify the current minimum for this network.'};
 return minimum>Number(amountUsd)?{ok:false,message:'NOWPayments requires approximately $'+minimum.toFixed(2)+' for '+coin.toUpperCase()+'. Select another coin or use manual payment.'}:{ok:true};
}
function sorted(value){
 if(Array.isArray(value))return value.map(sorted);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sorted(value[k])]));
 return value;
}
export async function verifiedSignature(payload,signature,key){
 if(!key||!signature||!/^[a-f0-9]{128}$/i.test(signature))return false;
 const imported=await crypto.subtle.importKey('raw',new TextEncoder().encode(String(key).trim()),{name:'HMAC',hash:'SHA-512'},false,['verify']);
 return crypto.subtle.verify('HMAC',imported,Uint8Array.from(signature.match(/../g),x=>parseInt(x,16)),new TextEncoder().encode(JSON.stringify(sorted(payload))));
}
export function paymentMatches(row,event){
 return event?.payment_status==='finished'&&String(event.order_id)===row.id&&
  String(event.invoice_id)===String(row.invoice_id)&&
  /^[0-9]{3,25}$/.test(String(event.payment_id||''))&&
  String(event.price_currency).toLowerCase()==='usd'&&
  Math.abs(Number(event.price_amount)-Number(row.amount_usd))<0.000001&&
  /^[a-z0-9]{2,30}$/i.test(String(event.pay_currency||''))&&
  (row.currency==='auto'||String(event.pay_currency).toLowerCase()===row.currency);
}
export async function findOrder(db,id,secret){
 if(!validOrderId(id)||!validOrderSecret(secret))return null;
 return db.prepare("SELECT * FROM gold_crypto_orders WHERE id=? AND secret_hash=? LIMIT 1").bind(id,await digest(secret)).first();
}
export function orderPublic(row){
 return {id:row.id,plan:row.plan,status:row.provisioned_ms?'active':row.status==='failed'?'failed':'pending',
  amountUsd:row.amount_usd,invoiceUrl:validInvoiceUrl(row.invoice_url)?row.invoice_url:null,
  expiresAt:row.provisioned_ms?row.expires_ms:null};
}
// A code is kept encrypted (never plaintext in D1) to let the buying browser
// retrieve the code after provider-verified settlement, even if email is unavailable.
async function cryptKey(secret){
 return crypto.subtle.importKey('raw',Uint8Array.from(secret.match(/../g),x=>parseInt(x,16)),'AES-GCM',false,['encrypt','decrypt']);
}
export async function encryptCode(code,secret){
 if(!/^[a-f0-9]{64}$/i.test(secret))throw Error('Payment encryption key missing');
 const iv=crypto.getRandomValues(new Uint8Array(12)),key=await cryptKey(secret);
 const bytes=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(code)));
 return Array.from([...iv,...bytes],n=>n.toString(16).padStart(2,'0')).join('');
}
export async function decryptCode(cipher,secret){
 try{
  if(!/^[a-f0-9]{64}$/i.test(secret)||!/^([0-9a-f]{2}){28,200}$/.test(cipher||''))return null;
  const buf=Uint8Array.from(cipher.match(/../g),x=>parseInt(x,16)),key=await cryptKey(secret);
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:buf.slice(0,12)},key,buf.slice(12)));
 }catch{return null}
}
export async function fulfillOrder(db,env,row){
 if(row.provisioned_ms)return true;
 const plan=planOf(row.plan);if(!plan||!env.GOLD_CRYPTO_CODE_KEY)return false;
 const claim=await db.prepare("UPDATE gold_crypto_orders SET status='fulfilling' WHERE id=? AND status='paid' AND provisioned_ms IS NULL").bind(row.id).run();
 if(claim.meta?.changes!==1)return false;
 const now=Date.now(),code=generatedCode(),codeHash=await digest(normalizedCode(code));
 const old=await db.prepare("SELECT access_until_ms FROM memberships WHERE email=?").bind(row.email).first();
 const expiresAt=Math.max(now,Number(old?.access_until_ms)||0)+plan.days*DAY;
 try{
  const cipher=await encryptCode(code,env.GOLD_CRYPTO_CODE_KEY);
  // D1 batch commits all three statements atomically, or none.
  await db.batch([
   db.prepare("INSERT INTO memberships(email,created_ms,access_until_ms,updated_ms) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET access_until_ms=excluded.access_until_ms,updated_ms=excluded.updated_ms").bind(row.email,now,expiresAt,now),
   db.prepare("INSERT INTO membership_codes(code_hash,email,created_ms,valid_until_ms,revoked_ms) VALUES(?,?,?,?,NULL)").bind(codeHash,row.email,now,expiresAt),
   db.prepare("UPDATE gold_crypto_orders SET status='complete',code_cipher=?,code_hash=?,provisioned_ms=?,expires_ms=? WHERE id=? AND status='fulfilling'").bind(cipher,codeHash,now,expiresAt,row.id)
  ]);
  try{await mail(env,row.email,'Your Gold Signal Room VIP '+plan.label+' access code','Payment confirmed. Your VIP membership is active until '+new Date(expiresAt).toUTCString()+'.\n\nEmail: '+row.email+'\nAccess code: '+code+'\n\nOpen https://gold.signaltoscript.com/ and choose Member login.');}
  catch(error){console.error('Gold crypto membership email could not be sent',error)}
  return true;
 }catch(error){
  console.error('Gold crypto fulfillment failed',error);
  await db.prepare("UPDATE gold_crypto_orders SET status='paid' WHERE id=? AND status='fulfilling'").bind(row.id).run();
  throw error;
 }
}
