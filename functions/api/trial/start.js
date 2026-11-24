import {normalizeEmail,validEmail,sameOrigin,jsonBody,instantSubscribe,trialCookie,respond} from '../../_lib/gold-trial.js';

// Subscription and trial activation are immediate. No email verification step.
export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return respond({error:'Please open Gold Breakout from the website.'},403);
 if(!env.DB)return respond({error:'Email signup is temporarily unavailable.'},503);
 try{
  const body=await jsonBody(request,1500);
  const email=normalizeEmail(body.email);
  if(!validEmail(email))return respond({error:'Enter a valid email address.'},400);
  if(body.website)return respond({ok:true});
  const {token}=await instantSubscribe(env.DB,email,{
   source:body.source||'gold-workspace',
   country:request.cf?.country,
   region:request.cf?.region,
   city:request.cf?.city,
   timezone:request.cf?.timezone,
   referrer:body.referrer,
   utmSource:body.utmSource,
   utmMedium:body.utmMedium,
   utmCampaign:body.utmCampaign
  });
  const response=respond({ok:true,active:true,message:'Your Gold Breakout alerts are activated.'});
  response.headers.append('Set-Cookie',trialCookie(token));
  return response;
 }catch(error){
  if(['JSON_REQUIRED','INVALID_JSON','TOO_LARGE'].includes(error.message))
   return respond({error:'Please enter your email and try again.'},400);
  console.error('Gold instant signup failed',error);
  return respond({error:'Could not save your email. Please try again.'},503);
 }
}
