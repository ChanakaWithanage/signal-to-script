import {adminAllowed,ensureSchema,json} from '../../_lib/access.js';
export async function onRequestGet({request,env}){
 if(!await adminAllowed(request,env))return json({error:'Unauthorized'},401);
 if(!env.DB)return json({error:'D1 not configured'},503);
 try{
  await ensureSchema(env.DB);
  const requests=await env.DB.prepare('SELECT id,email,name,note,plan,status,created_ms,updated_ms FROM membership_requests ORDER BY created_ms DESC LIMIT 100').all();
  const members=await env.DB.prepare('SELECT email,access_until_ms FROM memberships ORDER BY updated_ms DESC LIMIT 100').all();
  return json({requests:requests.results||[],members:members.results||[]});
 }catch(e){console.error('Admin list error',e);return json({error:'Unable to load requests'},503)}
}
