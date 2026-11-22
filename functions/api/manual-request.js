// One-step $4.99 manual script request: D1 is the source of truth, email notification is optional.
import {PRODUCTS,MEMBERSHIP,MEMBERSHIP_NAME,OFFER_END} from '../_lib/premium.js';
import {utcTime,sriLankaTime,visitorMeta} from '../_lib/checkout-tracking.js';

const HEADERS={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const respond=(obj,status=200)=>Response.json(obj,{status,headers:HEADERS});
const EMAIL=/^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[A-Za-z]{2,30}$/;
import {randomToken,hashToken} from '../_lib/download-access.js';

export async function manualReceiptId(secret){
 const digest=await hashToken(secret);
 return [digest.slice(0,8),digest.slice(8,12),digest.slice(12,16),digest.slice(16,20),digest.slice(20,32)].join('-');
}
const OFFER='4.99';
const validEmail=value=>typeof value==='string'&&value.length<=254&&EMAIL.test(value);
let tableInit;
async function ensureTable(db){
 if(!tableInit)tableInit=(async()=>{
  await db.prepare(`CREATE TABLE IF NOT EXISTS premium_manual_requests (
   id TEXT PRIMARY KEY, email TEXT NOT NULL, slug TEXT NOT NULL,
   product TEXT NOT NULL, price_usd TEXT NOT NULL, message TEXT NOT NULL,
   status TEXT NOT NULL DEFAULT 'new', notify_status TEXT NOT NULL DEFAULT 'not_configured',
   session_id TEXT, visitor_country TEXT, visitor_region TEXT, visitor_city TEXT,
   visitor_timezone TEXT, browser_timezone TEXT,
   created_ms INTEGER NOT NULL, created_at_utc TEXT NOT NULL, created_at_ist TEXT NOT NULL
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_manual_requests_date ON premium_manual_requests(created_ms DESC)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_manual_requests_email ON premium_manual_requests(email, created_ms)').run();
 })();
 try{await tableInit}catch(e){tableInit=null;throw e}
}
const destinationValid=v=>typeof v==='string'&&validEmail(v);
async function notifyOwner(env,db,entry){
 if(!env.RESEND_API_KEY||!destinationValid(env.MANUAL_REQUEST_NOTIFY_TO)||
    !destinationValid(env.MANUAL_REQUEST_FROM))return;
 try{
  const response=await fetch('https://api.resend.com/emails',{
   method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
   body:JSON.stringify({
    from:env.MANUAL_REQUEST_FROM,to:[env.MANUAL_REQUEST_NOTIFY_TO],
    reply_to:entry.email,
    subject:'Lifetime membership request - '+entry.product,
    text:'A new manual purchase request was submitted on SignalToScript.\n\n'+
     'Request ID: '+entry.id+'\nEmail: '+entry.email+'\n'+
     'Script: '+entry.product+'\nOffer: $'+entry.priceUsd+' USD\n'+
     'Location: '+[entry.country,entry.region,entry.city].filter(Boolean).join(', ')+'\n'+
     'Time: '+entry.createdAtUtc+'\n\n'+entry.message
   }),signal:AbortSignal.timeout(6500)
  });
  if(!response.ok)throw Error('Email API status '+response.status);
  await db.prepare("UPDATE premium_manual_requests SET notify_status='sent' WHERE id=?").bind(entry.id).run();
 }catch(error){
  console.error('Manual script request notification failed',error);
  try{await db.prepare("UPDATE premium_manual_requests SET notify_status='failed' WHERE id=?").bind(entry.id).run()}catch{}
 }
}
export async function onRequestPost({request,env,waitUntil}){
 if(request.headers.get('Origin')!==new URL(request.url).origin)
  return respond({error:'Invalid request origin.'},403);
 if(!(request.headers.get('Content-Type')||'').includes('application/json'))
  return respond({error:'JSON required.'},415);
 if(!env.DB)return respond({error:'Requests are temporarily unavailable. Please email support@signaltoscript.com.'},503);
 const raw=await request.text();
 if(raw.length>2000)return respond({error:'Request is too large.'},413);
 let data;try{data=JSON.parse(raw)}catch{return respond({error:'Invalid request.'},400)}
 if(!data||typeof data!=='object'||Array.isArray(data))return respond({error:'Invalid request.'},400);
 // Invisible honeypot: normal customers never see or fill this field.
 if(data.website)return respond({received:true},200);
 const slug=String(data.slug||'').trim();
 const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
 if(!Object.hasOwn(PRODUCTS,slug))return respond({error:'Please select a valid Pine Script.'},400);
 if(!validEmail(email))return respond({error:'Enter a valid email address to receive a reply.'},400);
 const meta=visitorMeta(request,data),ms=Date.now();
 try{
  await ensureTable(env.DB);
  // Keep accidental double submissions and basic automated abuse out of the inbox.
  const recent=await env.DB.prepare(
   'SELECT COUNT(*) AS total, MAX(created_ms) AS latest FROM premium_manual_requests WHERE email=? AND created_ms>?'
  ).bind(email,ms-86400000).first();
  if(Number(recent?.total||0)>=5)return respond({error:'You have reached today\'s request limit. Please email support@signaltoscript.com.'},429);
  if(ms-Number(recent?.latest||0)<90000)return respond({error:'Your recent request is already recorded. Please check your email for our reply.'},429);
  if(ms>=OFFER_END)return respond({error:'The Black Friday membership offer has ended.'},409);
  const secret=randomToken(),id=await manualReceiptId(secret),product=MEMBERSHIP_NAME;
  const message='Hello Signal to Script,\n\nI would like to purchase '+product+
   ' for the $'+OFFER+' USD manual-request offer. My first download will be '+PRODUCTS[slug]+'.\n\n'+
   'Please reply with an available payment option and the steps to activate lifetime access.\n\nThank you.';
  const entry={id,email,slug:MEMBERSHIP,product,priceUsd:OFFER,message,
   country:meta.country,region:meta.region,city:meta.city,createdAtUtc:utcTime(ms)};
  await env.DB.prepare(`INSERT INTO premium_manual_requests (
   id,email,slug,product,price_usd,message,status,notify_status,
   session_id,visitor_country,visitor_region,visitor_city,visitor_timezone,browser_timezone,
   created_ms,created_at_utc,created_at_ist
  ) VALUES (?,?,?,?,?,?,'new','not_configured',?,?,?,?,?,?,?,?,?)`)
   .bind(id,email,MEMBERSHIP,product,OFFER,message,meta.sessionId,meta.country,meta.region,meta.city,
    meta.timezone,meta.browserTimezone,ms,utcTime(ms),sriLankaTime(ms)).run();
  const notification=notifyOwner(env,env.DB,entry);
  if(typeof waitUntil==='function')waitUntil(notification);
  else await notification;
  return respond({received:true,requestId:id,secret,product},201);
 }catch(error){
  console.error('Manual request creation failed',error);
  return respond({error:'Could not submit your request. Please email support@signaltoscript.com.'},503);
 }
}
