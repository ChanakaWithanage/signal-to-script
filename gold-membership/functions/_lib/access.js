// Membership and access checks are server-side. Never trust browser roles or timestamps.
export const DAY=86400000,TERM_MS=30*DAY,DELAY_MS=30*60000,BAR_MS=15*60000;
const EMAIL=/^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[A-Za-z]{2,30}$/;
const COOKIE='__Host-gold_access';
export const emailOf=v=>typeof v==='string'?v.trim().toLowerCase():'';
export const validEmail=v=>v.length<=254&&EMAIL.test(v);
export const noCache={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
export const json=(body,status=200)=>Response.json(body,{status,headers:noCache});
export const sameOrigin=req=>req.headers.get('Origin')===new URL(req.url).origin;
export async function bodyOf(req){
 if(!req.headers.get('content-type')?.includes('application/json'))throw Error('JSON required');
 const text=await req.text();
 if(text.length>3000)throw Error('Request too large');
 const data=JSON.parse(text);
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid request');
 return data;
}
export function randomHex(bytes=32){
 return Array.from(crypto.getRandomValues(new Uint8Array(bytes)),n=>n.toString(16).padStart(2,'0')).join('');
}
export async function digest(value){
 const bytes=new TextEncoder().encode(String(value));
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
}
export function normalizedCode(value){
 if(typeof value!=='string'||value.length>100)return null;
 const raw=value.toUpperCase().replace(/[\s-]/g,'');
 return /^GOLD[A-F0-9]{32}$/.test(raw)?raw:null;
}
export function generatedCode(){
 const raw='GOLD'+randomHex(16).toUpperCase();
 return raw.slice(0,4)+'-'+raw.slice(4).match(/.{4}/g).join('-');
}
export function cookie(token,age=TERM_MS/1000){
 return COOKIE+'='+token+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+Math.floor(age);
}
export function clearCookie(){return cookie('',0)}
function tokenFrom(req){
 return (req.headers.get('Cookie')||'').match(/(?:^|;\s*)__Host-gold_access=([0-9a-f]{64})(?:;|$)/)?.[1]||null;
}
let schema;
export async function ensureSchema(db){
 if(!db)throw Error('D1 binding DB is missing');
 if(!schema)schema=(async()=>{
  await db.prepare("CREATE TABLE IF NOT EXISTS membership_requests(id TEXT PRIMARY KEY,email TEXT NOT NULL,name TEXT,note TEXT,status TEXT NOT NULL DEFAULT 'new',created_ms INTEGER NOT NULL,updated_ms INTEGER NOT NULL)").run();
  // Existing D1 deployments initially had no requested-plan column.
  const columns=await db.prepare("PRAGMA table_info(membership_requests)").all();
  if(!(columns.results||[]).some(col=>col.name==='plan'))
   await db.prepare("ALTER TABLE membership_requests ADD COLUMN plan TEXT NOT NULL DEFAULT 'monthly'").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS membership_requests_recent ON membership_requests(created_ms DESC)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS membership_requests_email ON membership_requests(email,created_ms DESC)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS memberships(email TEXT PRIMARY KEY,created_ms INTEGER NOT NULL,access_until_ms INTEGER NOT NULL,updated_ms INTEGER NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS membership_codes(code_hash TEXT PRIMARY KEY,email TEXT NOT NULL,created_ms INTEGER NOT NULL,valid_until_ms INTEGER NOT NULL,revoked_ms INTEGER)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS membership_codes_email ON membership_codes(email)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS membership_sessions(token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,created_ms INTEGER NOT NULL,expires_ms INTEGER NOT NULL)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS membership_sessions_email ON membership_sessions(email,expires_ms)").run();
 })();
 try{await schema}catch(e){schema=null;throw e}
}
export async function currentMember(db,req,now=Date.now()){
 if(!db)return null;
 const token=tokenFrom(req);if(!token)return null;
 const row=await db.prepare("SELECT m.email,m.access_until_ms FROM membership_sessions s JOIN memberships m ON m.email=s.email WHERE s.token_hash=? AND s.expires_ms>? AND m.access_until_ms>? LIMIT 1")
  .bind(await digest(token),now,now).first();
 return row?{email:row.email,expiresAt:Number(row.access_until_ms)}:null;
}
export function releasedBars(bars,member,now=Date.now()){
 if(member)return bars;
 // A candle can generate a signal only after its 15m close; public release
 // is at least 30 additional minutes after that close.
 return bars.filter(b=>b.time+BAR_MS<=now-DELAY_MS);
}
export async function adminAllowed(req,env){
 const supplied=(req.headers.get('Authorization')||'').match(/^Bearer (.{1,200})$/)?.[1];
 // Accept the operator's configured key regardless of its length; still require
 // a nonempty secret and compare hashed values rather than plaintext.
 if(!supplied||typeof env.ADMIN_KEY!=='string'||!env.ADMIN_KEY.length)return false;
 const [a,b]=await Promise.all([digest(supplied),digest(env.ADMIN_KEY)]);
 let different=0;for(let i=0;i<a.length;i++)different|=a.charCodeAt(i)^b.charCodeAt(i);
 return different===0;
}
export async function mail(env,to,subject,message){
 if(!env.RESEND_API_KEY||!env.RESEND_FROM_EMAIL)return false;
 const res=await fetch('https://api.resend.com/emails',{method:'POST',
  headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
  body:JSON.stringify({from:env.RESEND_FROM_EMAIL,to:[to],subject,text:message})});
 if(!res.ok)throw Error('Email delivery failed: '+res.status);
 return true;
}
