import {randomToken,hashToken} from './download-access.js';
export const TRIAL_DAYS=7,TRIAL_MS=TRIAL_DAYS*86400000;
const EMAIL=/^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[A-Za-z]{2,30}$/;
export const noCache={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
export const respond=(value,status=200)=>Response.json(value,{status,headers:noCache});
export const validEmail=value=>typeof value==='string'&&value.length<=254&&EMAIL.test(value);
export const normalizeEmail=value=>typeof value==='string'?value.trim().toLowerCase():'';
export const sameOrigin=request=>request.headers.get('Origin')===new URL(request.url).origin;
export async function jsonBody(request,max=4000){
 if(!request.headers.get('content-type')?.includes('application/json'))throw Error('JSON_REQUIRED');
 const raw=await request.text();if(raw.length>max)throw Error('TOO_LARGE');
 const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_JSON');
 return value;
}
const COOKIE='__Host-sts_trial';
export const trialCookie=(token,age=30*86400)=>COOKIE+'='+token+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+age;
function getToken(request){
 const match=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)__Host-sts_trial=([0-9a-f]{64})(?:;|$)/);
 return match?.[1]||null;
}
let schema;
export async function ensureTrialSchema(db){
 if(!db)throw Error('Trial database is not configured');
 if(!schema)schema=(async()=>{
  await db.prepare(`CREATE TABLE IF NOT EXISTS gold_trial_pending(
    token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,created_ms INTEGER NOT NULL,expires_ms INTEGER NOT NULL,used_ms INTEGER
   )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_gold_trial_pending_email ON gold_trial_pending(email,created_ms)').run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS gold_trial_accounts(
    email TEXT PRIMARY KEY,created_ms INTEGER NOT NULL,expires_ms INTEGER NOT NULL,
    lifetime INTEGER NOT NULL DEFAULT 0,expiry_notice_sent_ms INTEGER
   )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS gold_trial_sessions(
    token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires_ms INTEGER NOT NULL,created_ms INTEGER NOT NULL
   )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_gold_trial_sessions_email ON gold_trial_sessions(email,expires_ms)').run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS gold_trial_preferences(
    email TEXT PRIMARY KEY,email_alerts INTEGER NOT NULL DEFAULT 1,
    discord_webhook_cipher TEXT,telegram_chat_id TEXT,telegram_connect_hash TEXT,
    telegram_connect_expires_ms INTEGER,updated_ms INTEGER NOT NULL
   )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS gold_trial_deliveries(
    event_id TEXT NOT NULL,email TEXT NOT NULL,channel TEXT NOT NULL,
    status TEXT NOT NULL,created_ms INTEGER NOT NULL,updated_ms INTEGER NOT NULL,
    PRIMARY KEY(event_id,email,channel)
   )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS gold_trial_state(
    id TEXT PRIMARY KEY,last_event_ms INTEGER NOT NULL,updated_ms INTEGER NOT NULL
   )`).run();
 })();
 try{await schema}catch(e){schema=null;throw e}
}
export async function signedIn(db,request){
 const token=getToken(request);if(!token)return null;
 const row=await db.prepare(`SELECT a.email,a.created_ms,a.expires_ms,a.lifetime
 FROM gold_trial_sessions s JOIN gold_trial_accounts a ON a.email=s.email
 WHERE s.token_hash=? AND s.expires_ms>? LIMIT 1`)
  .bind(await hashToken(token),Date.now()).first();
 if(!row)return null;
 return {email:row.email,createdAt:row.created_ms,expiresAt:row.expires_ms,
   lifetime:row.lifetime===1,active:row.lifetime===1||row.expires_ms>Date.now(),
   remainingDays:row.lifetime===1?null:Math.max(0,Math.ceil((row.expires_ms-Date.now())/86400000))};
}
export const emailSender=env=>env.TRIAL_EMAIL_FROM||env.MANUAL_REQUEST_FROM||'';
export async function sendEmail(env,{to,subject,text,html}){
 if(!env.RESEND_API_KEY||!validEmail(emailSender(env)))throw Error('Email delivery has not been configured.');
 const res=await fetch('https://api.resend.com/emails',{
  method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
  body:JSON.stringify({from:emailSender(env),to:[to],subject,text,...(html?{html}:{})}),
  signal:AbortSignal.timeout(8500)
 });
 if(!res.ok)throw Error('Email delivery returned '+res.status);
 return true;
}
export async function requestAccess(db,env,email,origin){
 await ensureTrialSchema(db);
 const last=await db.prepare('SELECT created_ms FROM gold_trial_pending WHERE email=? ORDER BY created_ms DESC LIMIT 1').bind(email).first();
 if(last&&Date.now()-last.created_ms<60000)return {sent:true};
 const token=randomToken(),now=Date.now();
 // A trial starts when its access link is used, not when an address is entered.
 await db.prepare('INSERT INTO gold_trial_pending(token_hash,email,created_ms,expires_ms) VALUES(?,?,?,?)')
  .bind(await hashToken(token),email,now,now+20*60000).run();
 const link=origin+'/trial.html?verify='+token;
 try{await sendEmail(env,{to:email,subject:'Your Gold Breakout trial access link',
  text:'Welcome to Signal to Script.\n\nOpen your Gold Breakout dashboard using this secure link:\n'+link+
   '\n\nYour seven-day trial starts when you open the link. No credit card or recurring payment is required.\nThis link expires in 20 minutes.\n\nSignal to Script',
  html:'<p>Welcome to <strong>Signal to Script</strong>.</p><p>Your Gold Breakout workspace is ready.</p>'+
   '<p><a href="'+link+'" style="display:inline-block;padding:12px 18px;border-radius:7px;background:#1f5c46;color:#fff;text-decoration:none">Open my free trial</a></p>'+
   '<p>Your seven-day trial begins when you open the link. No card. No recurring payment.</p>'+
   '<p style="font-size:12px;color:#64748b">Link expires in 20 minutes.</p>'});
 }catch(e){await db.prepare('DELETE FROM gold_trial_pending WHERE token_hash=?').bind(await hashToken(token)).run();throw e}
 return {sent:true};
}
export async function verifyAccess(db,token){
 if(typeof token!=='string'||!/^[0-9a-f]{64}$/.test(token))return null;
 await ensureTrialSchema(db);
 const tokenHash=await hashToken(token),now=Date.now();
 const pending=await db.prepare('SELECT email FROM gold_trial_pending WHERE token_hash=? AND used_ms IS NULL AND expires_ms>?')
  .bind(tokenHash,now).first();
 if(!pending)return null;
 const claimed=await db.prepare('UPDATE gold_trial_pending SET used_ms=? WHERE token_hash=? AND used_ms IS NULL AND expires_ms>?')
  .bind(now,tokenHash,now).run();
 if(claimed.meta?.changes!==1)return null;
 await db.prepare(`INSERT INTO gold_trial_accounts(email,created_ms,expires_ms)
  VALUES(?,?,?) ON CONFLICT(email) DO NOTHING`).bind(pending.email,now,now+TRIAL_MS).run();
 await db.prepare(`INSERT INTO gold_trial_preferences(email,updated_ms) VALUES(?,?)
  ON CONFLICT(email) DO NOTHING`).bind(pending.email,now).run();
 const session=randomToken();
 await db.prepare('INSERT INTO gold_trial_sessions(token_hash,email,expires_ms,created_ms) VALUES(?,?,?,?)')
  .bind(await hashToken(session),pending.email,now+30*86400000,now).run();
 return session;
}
export async function preferences(db,email){
 return await db.prepare('SELECT email_alerts,discord_webhook_cipher,telegram_chat_id FROM gold_trial_preferences WHERE email=?')
  .bind(email).first();
}
// Webhooks are encrypted at rest. A 32-byte secret is shared by Pages and the Cron Worker.
export async function encryptWebhook(value,secret){
 if(!/^[0-9a-f]{64}$/i.test(secret||''))throw Error('Discord alerts have not been configured.');
 const key=await crypto.subtle.importKey('raw',Uint8Array.from(secret.match(/../g),h=>parseInt(h,16)),'AES-GCM',false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const out=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(value)));
 return btoa(String.fromCharCode(...iv,...out));
}
export async function decryptWebhook(value,secret){
 if(!value||!/^[0-9a-f]{64}$/i.test(secret||''))return null;
 try{
  const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey('raw',Uint8Array.from(secret.match(/../g),h=>parseInt(h,16)),'AES-GCM',false,['decrypt']);
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},key,bytes.slice(12)));
 }catch{return null}
}
export function discordUrl(value){
 try{const u=new URL(value);return u.protocol==='https:'&&
   ['discord.com','discordapp.com'].includes(u.hostname)&&
   /^\/api\/webhooks\/\d{10,25}\/[A-Za-z0-9_-]{20,}$/.test(u.pathname)&&
   !u.search&&!u.hash}
 catch{return false}
}
