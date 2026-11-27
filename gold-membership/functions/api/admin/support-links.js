import {adminAllowed,bodyOf,sameOrigin} from '../../_lib/access.js';
import {ensureSupportSchema,issueSupportLink,validSupportId,supportJSON} from '../../_lib/support-links.js';

export async function onRequest({request,env}){
 if(!await adminAllowed(request,env))return supportJSON({error:'Unauthorized'},401);
 if(!['GET','POST'].includes(request.method))return supportJSON({error:'Method not allowed'},405);
 if(request.method==='POST'&&!sameOrigin(request))return supportJSON({error:'Unauthorized'},401);
 try{
  let body;
  if(request.method==='POST'){
   try{body=await bodyOf(request)}catch{return supportJSON({error:'Invalid JSON request'},400)}
   if(!['generate','revoke','regenerate'].includes(body.action)||
    (body.action!=='generate'&&!validSupportId(body.id)))return supportJSON({error:'Invalid link action'},400);
  }
  await ensureSupportSchema(env.DB);
  if(request.method==='GET'){
   const rows=await env.DB.prepare(`SELECT id,created_ms,expires_ms,revoked_ms,replaced_by
    FROM membership_support_links ORDER BY created_ms DESC,id DESC LIMIT 100`).all();
   return supportJSON({links:rows.results||[],serverNow:Date.now()});
  }
  if(body.action==='revoke'){
   // Idempotent; revoking an expired link is also permitted.
   const result=await env.DB.prepare('UPDATE membership_support_links SET revoked_ms=COALESCE(revoked_ms,?) WHERE id=?')
    .bind(Date.now(),body.id).run();
   return result.meta?.changes===1?supportJSON({ok:true}):supportJSON({error:'Link not found'},404);
  }
  const result=await issueSupportLink(env.DB,new URL(request.url).origin,body.action==='regenerate'?body.id:null);
  return result?supportJSON(result,201):supportJSON({error:'Link not found or already regenerated. Refresh the list.'},409);
 }catch{
  // Never log a bearer URL, request body or raw database error.
  return supportJSON({error:'Temporary links are unavailable. Try again.'},503);
 }
}
