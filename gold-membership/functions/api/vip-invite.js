import {currentMember,ensureSchema,json,sameOrigin} from '../_lib/access.js';
import {vipReady,vipInvite} from '../../workers/vip.js';
export async function onRequestGet({env}){
 return json({enabled:vipReady(env)});
}
export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return json({error:'Invalid origin.'},403);
 if(!env.DB)return json({error:'Membership database unavailable.'},503);
 try{
  await ensureSchema(env.DB);
  const member=await currentMember(env.DB,request);
  if(!member)return json({error:'VIP access requires an active membership. Log in first.'},401);
  const url=await vipInvite(env.DB,env,member.email);
  return json({inviteUrl:url,expiresInMinutes:10});
 }catch(error){return json({error:String(error?.message||'Unable to create VIP invitation')},503)}
}
