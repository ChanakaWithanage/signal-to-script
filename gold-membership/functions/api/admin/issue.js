import {planOf} from '../../_lib/plans.js';
import {adminAllowed,bodyOf,sameOrigin,ensureSchema,json,emailOf,validEmail,DAY,generatedCode,normalizedCode,digest,mail} from '../../_lib/access.js';
// Manual verification only: staff explicitly confirms payment before issuing access.
export async function onRequestPost({request,env}){
 if(!sameOrigin(request)||!await adminAllowed(request,env))return json({error:'Unauthorized'},401);
 if(!env.DB)return json({error:'D1 not configured'},503);
 try{
  const body=await bodyOf(request),email=emailOf(body.email);
  if(!validEmail(email)||body.confirmPaid!==true)return json({error:'Email and payment confirmation required'},400);
  const plan=planOf(body.plan||'monthly');
  if(!plan)return json({error:'Choose a valid membership duration.'},400);
  await ensureSchema(env.DB);
  const now=Date.now();
  if(body.requestId){
   const item=await env.DB.prepare('SELECT email,status FROM membership_requests WHERE id=?')
    .bind(body.requestId).first();
   if(!item||item.email!==email||item.status==='closed')return json({error:'Request does not match this email'},400);
  }
  const prior=await env.DB.prepare('SELECT access_until_ms FROM memberships WHERE email=?')
   .bind(email).first();
  const previous=Number(prior?.access_until_ms)||0;
  const expiresAt=Math.max(now,previous)+plan.days*DAY;
  const code=generatedCode(),hash=await digest(normalizedCode(code));
  const statements=[
   env.DB.prepare('INSERT INTO memberships(email,created_ms,access_until_ms,updated_ms) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET access_until_ms=excluded.access_until_ms,updated_ms=excluded.updated_ms').bind(email,now,expiresAt,now),
   env.DB.prepare('INSERT INTO membership_codes(code_hash,email,created_ms,valid_until_ms,revoked_ms) VALUES(?,?,?,?,NULL)').bind(hash,email,now,expiresAt)
  ];
  if(body.requestId)statements.push(env.DB.prepare("UPDATE membership_requests SET status='paid',updated_ms=? WHERE id=?").bind(now,body.requestId));
  await env.DB.batch(statements);
  let emailed=false,mailError=null;
  try{
   emailed=await mail(env,email,'Your Gold Signals '+plan.label+' access code',
    'Your '+plan.label.toLowerCase()+' membership ('+plan.days+' days) is active until '+new Date(expiresAt).toUTCString()+'.\n\nLogin: '+new URL(request.url).origin+'\nEmail: '+email+'\nAccess code: '+code+
    '\n\nEnter your code in the member login form. Renewals add the selected plan duration to your remaining membership.');
  }catch(e){mailError='Email sending failed. Share the code manually.';console.error('Member code email failed',e)}
  return json({ok:true,email,code,plan:plan.id,days:plan.days,expiresAt,emailed,mailError});
 }catch(e){console.error('Admin membership issue failed',e);return json({error:'Unable to issue membership code'},503)}
}
