import {bodyOf,emailOf,validEmail,ensureSchema,randomHex,json,sameOrigin,mail} from '../_lib/access.js';
export async function onRequestPost({request,env,waitUntil}){
 if(!sameOrigin(request))return json({error:'Invalid request origin.'},403);
 if(!env.DB)return json({error:'Membership requests are temporarily unavailable.'},503);
 try{
  const body=await bodyOf(request),email=emailOf(body.email),name=String(body.name||'').trim().slice(0,90);
  const note=String(body.note||'').trim().slice(0,500);
  if(body.website)return json({ok:true});
  if(!validEmail(email))return json({error:'Enter a valid email to request membership.'},400);
  await ensureSchema(env.DB);
  const now=Date.now();
  const recent=await env.DB.prepare('SELECT id FROM membership_requests WHERE email=? AND created_ms>? LIMIT 1')
   .bind(email,now-60000).first();
  if(recent)return json({ok:true,message:'We already received your request.'});
  const id='REQ-'+randomHex(8).toUpperCase();
  await env.DB.prepare('INSERT INTO membership_requests(id,email,name,note,status,created_ms,updated_ms) VALUES(?,?,?,? ,?,?,?)')
   .bind(id,email,name||null,note||null,'new',now,now).run();
  if(env.OWNER_EMAIL){
   const notification=mail(env,env.OWNER_EMAIL,'Gold Signals membership request: '+id,
    'New membership request\n\nReference: '+id+'\nEmail: '+email+'\nName: '+(name||'—')+'\nMessage: '+(note||'—')+'\n\nReview requests in your private Gold Signals admin page.')
    .catch(e=>console.error('Owner email notification failed',e));
   if(typeof waitUntil==='function')waitUntil(notification);else await notification;
  }
  return json({ok:true,id,message:'Request received. We will email you with payment instructions.'},201);
 }catch(e){console.error('Gold membership request failed',e);return json({error:'Unable to save your request. Please retry.'},503)}
}
