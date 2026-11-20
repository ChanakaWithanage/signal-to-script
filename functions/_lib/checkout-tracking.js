// Minimal checkout analytics: coarse Cloudflare location and a pseudonymous browser session.
export const utcTime=ms=>new Date(ms).toISOString();
export const sriLankaTime=ms=>new Date(ms+19800000).toISOString().slice(0,19).replace('T',' ')+' +05:30';
const clean=(v,max=90)=>typeof v==='string'?v.replace(/[\x00-\x1f<>]/g,'').trim().slice(0,max):'';
export function visitorMeta(request,body={}){
 const cf=request.cf||{};
 return {
  sessionId:/^[a-zA-Z0-9-]{16,80}$/.test(String(body.sessionId||''))?body.sessionId:null,
  country:clean(cf.country,4)||null,region:clean(cf.region,90)||null,
  city:clean(cf.city,90)||null,timezone:clean(cf.timezone,90)||null,
  browserTimezone:clean(body.browserTimezone,90)||null
 };
}
let initialized;
export async function ensureCheckoutTracking(db){
 if(!initialized)initialized=(async()=>{
  await db.prepare(`CREATE TABLE IF NOT EXISTS premium_checkout_attempts (
   id TEXT PRIMARY KEY, session_id TEXT, provider TEXT NOT NULL, slug TEXT NOT NULL,
   currency TEXT, country TEXT, region TEXT, city TEXT, visitor_timezone TEXT,
   browser_timezone TEXT, status TEXT NOT NULL, order_id TEXT, error_code TEXT,
   created_ms INTEGER NOT NULL, created_at_utc TEXT NOT NULL, created_at_ist TEXT NOT NULL
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_checkout_attempt_time ON premium_checkout_attempts(created_ms)').run();
 })();
 try{await initialized}catch(e){initialized=null;throw e}
}
export async function trackCheckout(db,request,body,provider,slug,currency){
 await ensureCheckoutTracking(db);
 const meta=visitorMeta(request,body),ms=Date.now();
 const id=crypto.randomUUID();
 await db.prepare(`INSERT INTO premium_checkout_attempts(
  id,session_id,provider,slug,currency,country,region,city,visitor_timezone,
  browser_timezone,status,created_ms,created_at_utc,created_at_ist
 ) VALUES (?,?,?,?,?,?,?,?,?,?,'started',?,?,?)`)
 .bind(id,meta.sessionId,provider,slug,currency,meta.country,meta.region,
  meta.city,meta.timezone,meta.browserTimezone,ms,utcTime(ms),sriLankaTime(ms)).run();
 return {id,...meta};
}
export async function updateCheckoutAttempt(db,id,status,orderId=null,errorCode=null){
 if(!id)return;
 await db.prepare('UPDATE premium_checkout_attempts SET status=?,order_id=?,error_code=? WHERE id=?')
  .bind(status,orderId,errorCode,id).run();
}
