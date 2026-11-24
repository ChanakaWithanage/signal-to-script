import {ensureTrialSchema,signedIn,preferences,respond} from '../../_lib/gold-trial.js';
export async function onRequestGet({request,env}){
 if(!env.DB)return respond({signedIn:false,registrationAvailable:false});
 try{
  await ensureTrialSchema(env.DB);
  const member=await signedIn(env.DB,request);
  if(!member)return respond({signedIn:false,registrationAvailable:!!env.RESEND_API_KEY});
  const prefs=await preferences(env.DB,member.email);
  return respond({signedIn:true,...member,
   emailAlerts:prefs?.email_alerts===1,discordConnected:!!prefs?.discord_webhook_cipher,
   telegramConnected:!!prefs?.telegram_chat_id,
   delivery:{emailReady:!!env.RESEND_API_KEY,discordReady:!!env.ALERTS_ENCRYPTION_KEY,
    telegramReady:!!env.TELEGRAM_BOT_TOKEN&&!!env.TELEGRAM_BOT_USERNAME}});
 }catch(e){console.error('Trial session error',e);return respond({error:'Unable to load your trial.'},503)}
}
