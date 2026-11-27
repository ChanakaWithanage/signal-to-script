import {vipMemberJoined} from '../../workers/vip.js';
import {digest,ensureSchema} from '../_lib/access.js';
import {ensureAlertsSchema} from '../_lib/alerts.js';

// Register this URL with Telegram's setWebhook (see docs/instant-alerts.md).
// Only Telegram requests authenticated by its secret-token header may connect a chat.
export async function onRequestPost({request,env}){
 const provided=request.headers.get('X-Telegram-Bot-Api-Secret-Token');
 if(!env.TELEGRAM_WEBHOOK_SECRET||provided!==env.TELEGRAM_WEBHOOK_SECRET)
  return new Response('Forbidden',{status:403});
 if(!env.DB||!env.TELEGRAM_BOT_TOKEN)return new Response('Unavailable',{status:503});
 try{
  const raw=await request.text();
  if(raw.length>6000)return new Response('Payload too large',{status:413});
  const update=JSON.parse(raw),message=update?.message;
  if(update?.chat_member){
   await vipMemberJoined(env.DB,env,update.chat_member);
   return new Response('OK');
  }

  const match=/^\/start\s+([a-f0-9]{32})$/i.exec(String(message?.text||''));
  if(!match||message.chat?.type!=='private'||!Number.isSafeInteger(message.chat.id))
   return new Response('OK');
  await ensureSchema(env.DB);await ensureAlertsSchema(env.DB);
  const now=Date.now();
  const connected=await env.DB.prepare(
   "UPDATE gold_alert_preferences SET telegram_chat_id=?,telegram_connect_hash=NULL,telegram_connect_expires_ms=NULL,telegram_enabled_ms=?,updated_ms=? WHERE telegram_connect_hash=? AND telegram_connect_expires_ms>?"
  ).bind(String(message.chat.id),now,now,await digest(match[1].toLowerCase()),now).run();
  if(connected.meta?.changes===1){
   const result=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:message.chat.id,
     text:'✅ Gold Signal Room connected. Your real-time BUY, SELL and EXIT alerts will arrive here while your membership is active.',
     disable_web_page_preview:true}),signal:AbortSignal.timeout(8000)});
   if(!result.ok)console.error('Telegram connect confirmation returned',result.status);
  }
  return new Response('OK');
 }catch(error){
  console.error('Gold Telegram connection callback failed',error);
  return new Response('Retry',{status:503});
 }
}
