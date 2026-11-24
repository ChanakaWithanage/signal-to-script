import {fetchGoldCandles,runGoldBreakout} from '../functions/_lib/gold-market.js';
import {ensureTrialSchema,sendEmail,decryptWebhook,discordUrl} from '../functions/_lib/gold-trial.js';
const utc=t=>new Date(t).toLocaleString('en-US',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})+' UTC';
function message(e){
 const direction=e.type==='EXIT'?'CLOSE '+e.side:e.side;
 return 'GOLD BREAKOUT 15M | '+direction+'\n'+
   'Price: $'+e.price.toFixed(2)+'\nTime: '+utc(e.time)+'\n'+
   'Reason: '+e.reason+'\n'+
   'View live chart: https://signaltoscript.com/trial.html';
}
async function discord(env,encrypted,e){
 const url=await decryptWebhook(encrypted,env.ALERTS_ENCRYPTION_KEY);
 if(!discordUrl(url))throw Error('Invalid Discord destination');
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({content:message(e),allowed_mentions:{parse:[]}}),
  signal:AbortSignal.timeout(6500)});
 if(!response.ok)throw Error('Discord: '+response.status);
}
async function telegram(env,chat,e){
 if(!env.TELEGRAM_BOT_TOKEN||!/^\d{4,20}$/.test(chat))throw Error('Telegram not configured');
 const response=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({chat_id:chat,text:message(e),disable_web_page_preview:true}),
  signal:AbortSignal.timeout(6500)});
 if(!response.ok)throw Error('Telegram: '+response.status);
}
async function dispatch(db,env,email,channel,e,pref){
 const now=Date.now();
 const claimed=await db.prepare(`INSERT OR IGNORE INTO gold_trial_deliveries
  (event_id,email,channel,status,created_ms,updated_ms) VALUES(?,?,?,'sending',?,?)`)
  .bind(e.id,email,channel,now,now).run();
 if(claimed.meta?.changes!==1)return;
 try{
  if(channel==='email')await sendEmail(env,{to:email,
   subject:'Gold Breakout 15M · '+(e.type==='EXIT'?'Exit '+e.side:e.side+' entry'),
   text:message(e)});
  else if(channel==='discord')await discord(env,pref.discord_webhook_cipher,e);
  else if(channel==='telegram')await telegram(env,pref.telegram_chat_id,e);
  await db.prepare("UPDATE gold_trial_deliveries SET status='sent',updated_ms=? WHERE event_id=? AND email=? AND channel=?")
   .bind(Date.now(),e.id,email,channel).run();
 }catch(error){
  console.error('Alert delivery failed',channel,error.message);
  await db.prepare("UPDATE gold_trial_deliveries SET status='failed',updated_ms=? WHERE event_id=? AND email=? AND channel=?")
   .bind(Date.now(),e.id,email,channel).run();
 }
}
async function expirationEmails(db,env,now){
 if(!env.RESEND_API_KEY)return;
 const expired=await db.prepare(`SELECT email FROM gold_trial_accounts
  WHERE lifetime=0 AND expires_ms<=? AND expires_ms>? AND expiry_notice_sent_ms IS NULL LIMIT 25`)
  .bind(now,now-7*86400000).all();
 for(const row of expired.results||[]){
  try{
   await sendEmail(env,{to:row.email,subject:'Keep your Gold Breakout alerts for life',
    text:'Your seven-day Signal to Script trial has finished.\n\nKeep the live Gold Breakout workspace, alerts and extended backtests with a single lifetime membership. No subscriptions or recurring charges.\n\nExplore lifetime access: https://signaltoscript.com/checkout.html?script=gold-breakout-15m\n\nThank you for trying Signal to Script.'});
   await db.prepare('UPDATE gold_trial_accounts SET expiry_notice_sent_ms=? WHERE email=? AND expiry_notice_sent_ms IS NULL')
    .bind(now,row.email).run();
  }catch(e){console.error('Trial expiry email error',e.message)}
 }
}
export default {
 async scheduled(_controller,env,ctx){
  if(!env.DB)return;
  await ensureTrialSchema(env.DB);
  const now=Date.now();
  try{
   const feed=await fetchGoldCandles(30,{db:env.DB,
    waitUntil:ctx?.waitUntil?.bind(ctx)}),result=runGoldBreakout(feed.bars);
   const barTime=Date.parse(feed.asOf)-15*60000;
   const cursor=await env.DB.prepare("SELECT last_event_ms FROM gold_trial_state WHERE id='gold-15m'").first();
   if(!cursor){
    // First deployment establishes a baseline; do not send old trades to new subscribers.
    await env.DB.prepare("INSERT OR IGNORE INTO gold_trial_state(id,last_event_ms,updated_ms) VALUES('gold-15m',?,?)")
     .bind(barTime,now).run();
   }else{
    const pending=result.events.filter(e=>e.time>cursor.last_event_ms&&
     e.time<=barTime&&now-e.time<50*60000);
    if(pending.length){
     const members=await env.DB.prepare(`SELECT a.email,p.email_alerts,p.discord_webhook_cipher,p.telegram_chat_id
      FROM gold_trial_accounts a JOIN gold_trial_preferences p ON p.email=a.email
      WHERE a.lifetime=1 OR a.expires_ms>?`).bind(now).all();
     const tasks=[];
     for(const e of pending)for(const member of members.results||[]){
      if(member.email_alerts&&env.RESEND_API_KEY)
       tasks.push(dispatch(env.DB,env,member.email,'email',e,member));
      if(member.discord_webhook_cipher&&env.ALERTS_ENCRYPTION_KEY)
       tasks.push(dispatch(env.DB,env,member.email,'discord',e,member));
      if(member.telegram_chat_id&&env.TELEGRAM_BOT_TOKEN)
       tasks.push(dispatch(env.DB,env,member.email,'telegram',e,member));
     }
     // Bound outbound work; scheduled every 5 minutes. No historical flood.
     for(let i=0;i<tasks.length;i+=12)await Promise.allSettled(tasks.slice(i,i+12));
    }
    await env.DB.prepare("UPDATE gold_trial_state SET last_event_ms=?,updated_ms=? WHERE id='gold-15m' AND last_event_ms<?")
     .bind(barTime,now,barTime).run();
   }
  }catch(e){console.error('Gold alert scan failed',e)}
  await expirationEmails(env.DB,env,now);
 }
};
