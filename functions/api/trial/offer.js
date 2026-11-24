import {ensureTrialSchema,signedIn,sameOrigin,claimUpgradePrompt,respond} from '../../_lib/gold-trial.js';

export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return respond({error:'Invalid request origin.'},403);
 if(!env.DB)return respond({show:false});
 try{
  await ensureTrialSchema(env.DB);
  const member=await signedIn(env.DB,request);
  if(!member)return respond({show:false});
  return respond({show:await claimUpgradePrompt(env.DB,member)});
 }catch(error){
  console.error('Gold trial membership prompt error',error);
  return respond({show:false});
 }
}
