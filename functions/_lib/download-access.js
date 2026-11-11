// Shared D1 access and guest download helpers for Cloudflare Pages.
const MEMBER_COOKIE='__Host-sts_google';
const GUEST_COOKIE='sts_free_guest';
const MONTH=30*24*60*60;
const SIX_MONTHS=180*24*60*60;
let initialized=null;
const TABLES=[
 `CREATE TABLE IF NOT EXISTS free_google_members (
  google_sub TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 )`,
 `CREATE TABLE IF NOT EXISTS free_google_sessions (
  token_hash TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 )`,
 `CREATE TABLE IF NOT EXISTS free_guest_downloads (
  token_hash TEXT PRIMARY KEY,
  script_slug TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 )`
];
export async function ensureAccessSchema(db){
 if(!db)return false;
 if(!initialized)initialized=(async()=>{for(const sql of TABLES)await db.prepare(sql).run()})();
 try{await initialized;return true}catch(error){initialized=null;throw error}
}
function cookies(request){
 return Object.fromEntries((request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.includes('=')).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)]}));
}
const validToken=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
export function memberToken(request){const x=cookies(request)[MEMBER_COOKIE];return validToken(x)?x:null}
function guestToken(request){const x=cookies(request)[GUEST_COOKIE];return validToken(x)?x:null}
export function randomToken(){const b=new Uint8Array(32);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('')}
export async function hashToken(t){const b=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)));return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('')}
export function cookieHeader(kind,value,age){const name=kind==='member'?MEMBER_COOKIE:GUEST_COOKIE;return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`}
export const ACCESS_AGE={member:MONTH,guest:SIX_MONTHS};
export const noStore=()=>({'Cache-Control':'no-store','Vary':'Cookie'});
export async function isMember(db,request){
 const token=memberToken(request);if(!token)return false;
 return !!await db.prepare('SELECT google_sub FROM free_google_sessions WHERE token_hash = ? AND expires_at > ? LIMIT 1')
  .bind(await hashToken(token),new Date().toISOString()).first();
}
export async function guestUsed(db,request){
 const token=guestToken(request);if(!token)return false;
 return !!await db.prepare('SELECT token_hash FROM free_guest_downloads WHERE token_hash = ? LIMIT 1').bind(await hashToken(token)).first();
}
export async function claimGuestDownload(db,request,slug){
 const existing=guestToken(request),token=existing||randomToken();
 const row=await db.prepare('INSERT OR IGNORE INTO free_guest_downloads (token_hash,script_slug) VALUES (?,?)')
  .bind(await hashToken(token),slug).run();
 return {allowed:row.meta?.changes===1,cookie:!existing&&row.meta?.changes===1?cookieHeader('guest',token,SIX_MONTHS):null};
}
export function correctOrigin(request){return request.headers.get('Origin')===new URL(request.url).origin}
