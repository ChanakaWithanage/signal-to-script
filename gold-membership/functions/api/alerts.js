import {vipReady} from '../../workers/vip.js';
import {bodyOf,sameOrigin,currentMember,ensureSchema,json} from '../_lib/access.js';
import {ensureAlertsSchema,ensureAlertPreferences,alertPreferences,alertReady,
 discordWebhookUrl,encryptDiscord,publicAlertPreferences,createTelegramLink,
 claimTestSend,sendAlert,signalMessage} from '../_lib/alerts.js';

const status=async(db,email,env)=>{
 const prefs=publicAlertPreferences(await ensureAlertPreferences(db,email),env);
 const worker=await db.prepare("SELECT updated_ms FROM gold_alert_state WHERE id='gold-15m'").first();
 const lastScanAt=Number(worker?.updated_ms)||null;
 return {...prefs,vipChannelEnabled:vipReady(env),deliveryOnline:!!lastScanAt&&Date.now()-lastScanAt<7*60000,lastScanAt};
 };
async function authorized(request,env){
 await ensureSchema(env.DB);await ensureAlertsSchema(env.DB);
 return currentMember(env.DB,request);
}
export async function onRequestGet({request,env}){
 if(!env.DB)return json({error:'Alert storage is not configured.'},503);
 try{
  const member=await authorized(request,env);
  if(!member)return json({error:'Sign in with an active membership to manage alerts.'},401);
  return json({ok:true,...await status(env.DB,member.email,env)});
 }catch(e){console.error('Gold alert preferences unavailable',e);return json({error:'Could not load alert settings.'},503)}
}
export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return json({error:'Invalid request origin.'},403);
 if(!env.DB)return json({error:'Alert storage is not configured.'},503);
 try{
  const member=await authorized(request,env);
  if(!member)return json({error:'An active VIP membership is required for instant alerts.'},401);
  const payload=await bodyOf(request);
  const now=Date.now(),ready=alertReady(env),email=member.email;
  const action=payload.action;
  if(action==='email'){
   if(typeof payload.enabled!=='boolean')return json({error:'Choose whether email alerts are enabled.'},400);
   if(payload.enabled&&!ready.email)return json({error:'Email notifications are being configured. Please try another channel.'},503);
   await env.DB.prepare("UPDATE gold_alert_preferences SET email_enabled=?,email_enabled_ms=?,updated_ms=? WHERE email=?")
    .bind(payload.enabled?1:0,payload.enabled?now:null,now,email).run();
  }else if(action==='discord'){
   if(typeof payload.webhook!=='string'||payload.webhook.length>450)
    return json({error:'Enter a Discord webhook URL or remove your connection.'},400);
   const hook=payload.webhook.trim();
   if(hook&&!discordWebhookUrl(hook))
    return json({error:'Paste a complete Discord channel webhook URL from Discord integrations.'},400);
   if(hook&&!ready.discord)return json({error:'Discord notifications are being configured. Please try another channel.'},503);
   const encrypted=hook?await encryptDiscord(hook,env.ALERTS_ENCRYPTION_KEY):null;
   await env.DB.prepare("UPDATE gold_alert_preferences SET discord_cipher=?,discord_enabled_ms=?,updated_ms=? WHERE email=?")
    .bind(encrypted,hook?now:null,now,email).run();
  }else if(action==='telegram-link'){
   if(!ready.telegram)return json({error:'Telegram bot notifications are not configured.'},503);
   return json({ok:true,telegramUrl:await createTelegramLink(env.DB,email,env)});
  }else if(action==='telegram-remove'){
   await env.DB.prepare("UPDATE gold_alert_preferences SET telegram_chat_id=NULL,telegram_connect_hash=NULL,telegram_connect_expires_ms=NULL,telegram_enabled_ms=NULL,updated_ms=? WHERE email=?")
    .bind(now,email).run();
  }else if(action==='test'){
   if(!['email','discord','telegram'].includes(payload.channel))
    return json({error:'Choose a valid test channel.'},400);
   const prefs=await alertPreferences(env.DB,email);
   const channel=payload.channel;
   if(channel==='email'&&(!prefs.email_enabled||!ready.email)||
      channel==='discord'&&(!prefs.discord_cipher||!ready.discord)||
      channel==='telegram'&&(!prefs.telegram_chat_id||!ready.telegram))
    return json({error:'Connect and enable this channel before sending a test.'},400);
   if(!await claimTestSend(env.DB,email,channel,now))
    return json({error:'A test was recently sent. Try again in 10 minutes.'},429);
   await sendAlert(env,channel,email,prefs,signalMessage(null,{siteUrl:env.ALERT_SITE_URL||'https://gold.signaltoscript.com',test:true}));
   return json({ok:true,message:'Test alert sent. Check your '+channel+' notifications.'});
  }else return json({error:'Unknown notification setting.'},400);
  return json({ok:true,...await status(env.DB,email,env)});
 }catch(error){
  if(error instanceof SyntaxError||['JSON required','Request too large','Invalid request'].includes(error.message))
   return json({error:'Invalid request.'},400);
  console.error('Gold alert setting update failed',error);
  return json({error:'Could not save or send your alert setting. Try again.'},503);
 }
}
