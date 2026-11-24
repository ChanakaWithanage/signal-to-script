import {ensureTrialSchema,signedIn,preferences,respond,sameOrigin,jsonBody,discordUrl,encryptWebhook} from '../../_lib/gold-trial.js';
import {randomToken,hashToken} from '../../_lib/download-access.js';
export async function onRequestGet({request,env}){
 if(!env.DB)return respond({error:'Notifications are unavailable.'},503);
 await ensureTrialSchema(env.DB);
 const user=await signedIn(env.DB,request);if(!user)return respond({error:'Please sign in.'},401);
 const prefs=await preferences(env.DB,user.email);
 return respond({emailAlerts:!!prefs?.email_alerts,discordConnected:!!prefs?.discord_webhook_cipher,
  telegramConnected:!!prefs?.telegram_chat_id});
}
export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return respond({error:'Invalid request origin.'},403);
 if(!env.DB)return respond({error:'Notifications are unavailable.'},503);
 try{
  await ensureTrialSchema(env.DB);
  const user=await signedIn(env.DB,request);if(!user)return respond({error:'Please sign in.'},401);
  if(!user.active)return respond({error:'Your trial has ended. Upgrade to keep alerts running.'},403);
  const body=await jsonBody(request,2000);
  if(body.action==='email'){
   if(typeof body.enabled!=='boolean')return respond({error:'Choose an email alert setting.'},400);
   await env.DB.prepare('UPDATE gold_trial_preferences SET email_alerts=?,updated_ms=? WHERE email=?')
    .bind(body.enabled?1:0,Date.now(),user.email).run();
  }else if(body.action==='discord'){
   if(body.webhook!==''&&!discordUrl(body.webhook))return respond({error:'Enter a valid Discord channel webhook URL.'},400);
   const encoded=body.webhook?await encryptWebhook(body.webhook,env.ALERTS_ENCRYPTION_KEY):null;
   await env.DB.prepare('UPDATE gold_trial_preferences SET discord_webhook_cipher=?,updated_ms=? WHERE email=?')
    .bind(encoded,Date.now(),user.email).run();
  }else if(body.action==='telegram-link'){
   if(!env.TELEGRAM_BOT_USERNAME||!env.TELEGRAM_BOT_TOKEN)return respond({error:'Telegram setup is not available yet.'},503);
   const username=String(env.TELEGRAM_BOT_USERNAME).replace(/^@/,'');
   if(!/^[A-Za-z0-9_]{5,32}$/.test(username))return respond({error:'Telegram bot needs configuration.'},503);
   const code=randomToken().slice(0,32);
   await env.DB.prepare('UPDATE gold_trial_preferences SET telegram_connect_hash=?,telegram_connect_expires_ms=?,updated_ms=? WHERE email=?')
    .bind(await hashToken(code),Date.now()+15*60000,Date.now(),user.email).run();
   return respond({ok:true,telegramUrl:'https://t.me/'+username+'?start='+code});
  }else if(body.action==='telegram-remove'){
   await env.DB.prepare('UPDATE gold_trial_preferences SET telegram_chat_id=NULL,telegram_connect_hash=NULL,updated_ms=? WHERE email=?')
    .bind(Date.now(),user.email).run();
  }else return respond({error:'Unknown notification setting.'},400);
  const prefs=await preferences(env.DB,user.email);
  return respond({ok:true,emailAlerts:!!prefs?.email_alerts,discordConnected:!!prefs?.discord_webhook_cipher,
   telegramConnected:!!prefs?.telegram_chat_id});
 }catch(e){
  if(e.message==='JSON_REQUIRED'||e.message==='INVALID_JSON'||e.message==='TOO_LARGE')return respond({error:'Invalid request.'},400);
  console.error('Trial preference change failed',e);
  return respond({error:'This setting could not be saved. Please try again.'},503);
 }
}
