import {ensureTrialSchema} from '../../_lib/gold-trial.js';
import {hashToken} from '../../_lib/download-access.js';
export async function onRequestPost({request,env}){
 if(!env.TELEGRAM_WEBHOOK_SECRET||request.headers.get('X-Telegram-Bot-Api-Secret-Token')!==env.TELEGRAM_WEBHOOK_SECRET)
  return new Response('Forbidden',{status:403});
 if(!env.DB||!env.TELEGRAM_BOT_TOKEN)return new Response('Not configured',{status:503});
 try{
  const raw=await request.text();if(raw.length>6000)return new Response('Too large',{status:413});
  const item=JSON.parse(raw),message=item.message;
  const match=/^\/start\s+([0-9a-f]{32})$/.exec(String(message?.text||''));
  if(!match||message.chat?.type!=='private'||!Number.isSafeInteger(message.chat.id))return new Response('OK');
  await ensureTrialSchema(env.DB);
  const digest=await hashToken(match[1]),now=Date.now();
  const result=await env.DB.prepare(`UPDATE gold_trial_preferences
   SET telegram_chat_id=?,telegram_connect_hash=NULL,telegram_connect_expires_ms=NULL,updated_ms=?
   WHERE telegram_connect_hash=? AND telegram_connect_expires_ms>?`)
   .bind(String(message.chat.id),now,digest,now).run();
  if(result.meta?.changes){
   await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:message.chat.id,text:'Connected! Gold Breakout entry and exit alerts will arrive here while your access is active.'})
   });
  }
  return new Response('OK');
 }catch(e){console.error('Telegram webhook error',e);return new Response('Retry',{status:503})}
}
