import {randomHex,digest} from './access.js';

export const SUPPORT_TTL_MS=30*60*1000;
export const supportHeaders={
 'Cache-Control':'private, no-store, max-age=0',
 'X-Robots-Tag':'noindex, nofollow, noarchive',
 'Referrer-Policy':'no-referrer',
 'X-Content-Type-Options':'nosniff',
 'X-Frame-Options':'DENY',
 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
 'Vary':'Accept, Authorization'
};
export const supportJSON=(body,status=200)=>Response.json(body,{status,headers:supportHeaders});
const schemas=new WeakMap();
export async function ensureSupportSchema(db){
 if(!db)throw Error('D1 binding DB is missing');
 if(!schemas.has(db))schemas.set(db,(async()=>{
  await db.prepare(`CREATE TABLE IF NOT EXISTS membership_support_links (
   id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
   created_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL,
   revoked_ms INTEGER, replaced_by TEXT
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS membership_support_links_recent ON membership_support_links(created_ms DESC)').run();
 })());
 try{await schemas.get(db)}catch(e){schemas.delete(db);throw e}
}
export const validSupportId=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
export async function issueSupportLink(db,origin,previousId=null,now=Date.now()){
 const id=randomHex(16),token=randomHex(32),hash=await digest(token),expiresAt=now+SUPPORT_TTL_MS;
 if(previousId){
  // D1 batch is transactional: insert a replacement once, then revoke its predecessor.
  // A duplicate/concurrent regeneration cannot create an extra live replacement.
  const results=await db.batch([
   db.prepare(`INSERT INTO membership_support_links(id,token_hash,created_ms,expires_ms)
    SELECT ?,?,?,? FROM membership_support_links WHERE id=? AND replaced_by IS NULL`)
    .bind(id,hash,now,expiresAt,previousId),
   db.prepare(`UPDATE membership_support_links SET revoked_ms=COALESCE(revoked_ms,?),replaced_by=?
    WHERE id=? AND replaced_by IS NULL`).bind(now,id,previousId)
  ]);
  if(results[0].meta?.changes!==1)return null;
 }else{
  await db.prepare('INSERT INTO membership_support_links(id,token_hash,created_ms,expires_ms) VALUES(?,?,?,?)')
   .bind(id,hash,now,expiresAt).run();
 }
 // The token is returned once; only its hash and non-customer metadata are persisted.
 return {id,url:new URL('/support/'+token,origin).href,createdAt:now,expiresAt};
}
export async function activeSupportLink(db,token,now=Date.now()){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;
 await ensureSupportSchema(db);
 return db.prepare(`SELECT expires_ms FROM membership_support_links
  WHERE token_hash=? AND revoked_ms IS NULL AND expires_ms>? LIMIT 1`)
  .bind(await digest(token),now).first();
}
