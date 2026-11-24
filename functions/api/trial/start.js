import {normalizeEmail,validEmail,sameOrigin,jsonBody,requestAccess,respond} from '../../_lib/gold-trial.js';
export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return respond({error:'Please open the trial from the website.'},403);
 if(!env.DB)return respond({error:'Trial registration is temporarily unavailable.'},503);
 try{
  const body=await jsonBody(request,1200),email=normalizeEmail(body.email);
  if(!validEmail(email))return respond({error:'Enter a valid email address.'},400);
  if(body.website)return respond({sent:true});
  await requestAccess(env.DB,env,email,new URL(request.url).origin);
  return respond({sent:true,message:'Access link sent. Check your inbox to open Gold Breakout.'});
 }catch(error){
  if(['JSON_REQUIRED','INVALID_JSON','TOO_LARGE'].includes(error.message))
   return respond({error:'Please enter your email and try again.'},400);
  console.error('Gold trial start failed',error);
  return respond({error:'We could not send your access link. Please try again shortly.'},503);
 }
}
