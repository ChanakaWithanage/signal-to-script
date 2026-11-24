import {sameOrigin,jsonBody,verifyAccess,trialCookie,respond} from '../../_lib/gold-trial.js';
export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return respond({error:'Invalid access request.'},403);
 if(!env.DB)return respond({error:'Trial login is temporarily unavailable.'},503);
 try{
  const data=await jsonBody(request,500),session=await verifyAccess(env.DB,data.token);
  if(!session)return respond({error:'This link has expired or has already been used. Request a new access link.'},401);
  const res=respond({ok:true});
  res.headers.append('Set-Cookie',trialCookie(session));
  return res;
 }catch(error){console.error('Gold trial verification failed',error);return respond({error:'Unable to complete sign-in. Request a new link.'},503)}
}
