import {ensureTrialSchema,signedIn,respond,sameOrigin,jsonBody,proveCurrentSession} from '../../_lib/gold-trial.js';
import {manualReceiptId} from '../manual-request.js';
import {lookupOrder,ensurePremiumSchema,MEMBERSHIP} from '../../_lib/premium.js';
export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return respond({error:'Invalid request origin.'},403);
 if(!env.DB)return respond({error:'Membership lookup unavailable.'},503);
 try{
  await ensureTrialSchema(env.DB);
  const user=await signedIn(env.DB,request);if(!user)return respond({error:'Sign in with your email first.'},401);
  const body=await jsonBody(request,1500),id=String(body.id||''),secret=String(body.secret||'');
  let paid=false;
  if(body.method==='manual'){
   if(!/^[a-f0-9-]{36}$/.test(id)||!/^[a-f0-9]{64}$/.test(secret)||await manualReceiptId(secret)!==id)
    return respond({error:'Membership receipt was not recognized.'},400);
   const order=await env.DB.prepare('SELECT status FROM premium_manual_requests WHERE id=? AND slug=?')
    .bind(id,MEMBERSHIP).first();paid=order?.status==='paid';
  }else{
   await ensurePremiumSchema(env.DB);
   const order=await lookupOrder(env.DB,id,secret);
   paid=order?.status==='paid'&&order.slug===MEMBERSHIP;
  }
  if(!paid)return respond({error:'This receipt has not been activated yet. Please use a completed membership receipt.'},403);
  await env.DB.prepare('UPDATE gold_trial_accounts SET lifetime=1 WHERE email=?').bind(user.email).run();
  // A verified, paid receipt proves authorization for this browser session.
  await proveCurrentSession(env.DB,request);
  return respond({ok:true,lifetime:true});
 }catch(e){console.error('Trial membership redeem error',e);return respond({error:'Could not verify your membership receipt.'},503)}
}
