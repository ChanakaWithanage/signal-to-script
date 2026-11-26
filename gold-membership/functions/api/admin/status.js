import {adminAllowed,bodyOf,sameOrigin,ensureSchema,json} from '../../_lib/access.js';
export async function onRequestPost({request,env}){
 if(!sameOrigin(request)||!await adminAllowed(request,env))return json({error:'Unauthorized'},401);
 try{
  const body=await bodyOf(request);
  if(!['new','contacted','closed'].includes(body.status)||typeof body.id!=='string')return json({error:'Invalid status'},400);
  await ensureSchema(env.DB);
  const result=await env.DB.prepare('UPDATE membership_requests SET status=?,updated_ms=? WHERE id=? AND status!=?')
   .bind(body.status,Date.now(),body.id,'paid').run();
  return json({ok:result.meta?.changes===1});
 }catch(e){console.error('Admin request status failed',e);return json({error:'Unable to update status'},503)}
}
