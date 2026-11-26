import {bodyOf,emailOf,validEmail,normalizedCode,digest,randomHex,cookie,ensureSchema,json,sameOrigin,TERM_MS} from '../_lib/access.js';
export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return json({error:'Invalid request origin.'},403);
 if(!env.DB)return json({error:'Member login is temporarily unavailable.'},503);
 try{
  const body=await bodyOf(request),email=emailOf(body.email),code=normalizedCode(body.code);
  if(!validEmail(email)||!code)return json({error:'Enter your membership email and access code.'},400);
  await ensureSchema(env.DB);
  const now=Date.now(),hash=await digest(code);
  const member=await env.DB.prepare("SELECT m.access_until_ms FROM membership_codes c JOIN memberships m ON m.email=c.email WHERE c.email=? AND c.code_hash=? AND c.revoked_ms IS NULL AND c.valid_until_ms>? AND m.access_until_ms>? LIMIT 1")
   .bind(email,hash,now,now).first();
  if(!member)return json({error:'Code not recognized or membership expired. Please request renewal.'},401);
  const session=randomHex(),expiry=Math.min(now+TERM_MS,Number(member.access_until_ms));
  await env.DB.prepare("INSERT INTO membership_sessions(token_hash,email,created_ms,expires_ms) VALUES(?,?,?,?)")
   .bind(await digest(session),email,now,expiry).run();
  const res=json({ok:true,active:true,email,expiresAt:Number(member.access_until_ms)});
  res.headers.append('Set-Cookie',cookie(session,(expiry-now)/1000));
  return res;
 }catch(e){console.error('Gold code login failed',e);return json({error:'Unable to verify your code.'},503)}
}
