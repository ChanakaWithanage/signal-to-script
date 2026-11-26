import {BAR_MS,ensureSchema} from '../functions/_lib/access.js';
import {fetchGoldCandles,runGoldBreakout} from '../functions/_lib/gold-market.js';
import {ensureAlertsSchema,eligibleEvents,activeChannels,sendAlert,signalMessage} from '../functions/_lib/alerts.js';

const ID='gold-15m';
const RETRY_AFTER_MS=2*60000;
const STALE_CLAIM_MS=5*60000;
const MAX_ATTEMPTS=3;

// D1 atomically decides which invocation gets the right to deliver a message.
// "sent" messages never get re-claimed, including overlapping cron invocations.
async function claimDelivery(db,e,email,channel,now){
 const res=await db.prepare(
  "INSERT INTO gold_alert_deliveries(event_id,email,channel,status,attempts,last_error,updated_ms) VALUES(?,?,?,'sending',1,NULL,?) "+
  "ON CONFLICT(event_id,email,channel) DO UPDATE SET status='sending',attempts=gold_alert_deliveries.attempts+1,last_error=NULL,updated_ms=excluded.updated_ms "+
  "WHERE gold_alert_deliveries.attempts<? AND "+
  "((gold_alert_deliveries.status='failed' AND gold_alert_deliveries.updated_ms<=?) "+
  "OR (gold_alert_deliveries.status='sending' AND gold_alert_deliveries.updated_ms<=?))"
 ).bind(e.id,email,channel,now,MAX_ATTEMPTS,now-RETRY_AFTER_MS,now-STALE_CLAIM_MS).run();
 return res.meta?.changes===1;
}
async function deliver(db,env,e,pref,channel,now){
 if(!await claimDelivery(db,e,pref.email,channel,now))return 'already';
 try{
  const siteUrl=env.ALERT_SITE_URL||'https://gold.signaltoscript.com';
  await sendAlert(env,channel,pref.email,pref,signalMessage(e,{siteUrl}));
  await db.prepare(
   "UPDATE gold_alert_deliveries SET status='sent',last_error=NULL,updated_ms=? WHERE event_id=? AND email=? AND channel=?"
  ).bind(Date.now(),e.id,pref.email,channel).run();
  return 'sent';
 }catch(error){
  await db.prepare(
   "UPDATE gold_alert_deliveries SET status='failed',last_error=?,updated_ms=? WHERE event_id=? AND email=? AND channel=?"
  ).bind(String(error.message||'Delivery failed').slice(0,180),Date.now(),e.id,pref.email,channel).run();
  console.error('Gold alert delivery failed',channel,String(error.message).slice(0,150));
  return 'failed';
 }
}
export async function runAlertScan(env,ctx,{now=Date.now(),feedProvider=fetchGoldCandles}={}){
 if(!env.DB)throw Error('Missing DB binding on Gold alert Worker');
 const db=env.DB;
 await ensureSchema(db);
 await ensureAlertsSchema(db);
 const feed=await feedProvider(30,{db,waitUntil:ctx?.waitUntil?.bind(ctx)});
 const asOf=Date.parse(feed.asOf);
 const latestBarOpen=asOf-BAR_MS;
 if(!Number.isFinite(latestBarOpen)||!feed.bars?.length)throw Error('Gold feed has no confirmed candles');
 // First scheduled run starts at the latest candle; never blast historic trades
 // to new members when the alert system is first deployed.
 const began=await db.prepare(
  "INSERT OR IGNORE INTO gold_alert_state(id,started_bar_ms,updated_ms) VALUES(?,?,?)"
 ).bind(ID,latestBarOpen,now).run();
 if(began.meta?.changes===1)return {initialized:true,events:0,sent:0};
 const state=await db.prepare(
  "SELECT started_bar_ms FROM gold_alert_state WHERE id=?"
 ).bind(ID).first();
 const model=runGoldBreakout(feed.bars);
 const events=eligibleEvents(model.events,Number(state?.started_bar_ms)||latestBarOpen,now);
 if(!events.length){
  await db.prepare("UPDATE gold_alert_state SET updated_ms=? WHERE id=?").bind(now,ID).run();
  return {initialized:false,events:0,sent:0};
 }
 const members=await db.prepare(
  "SELECT p.*,m.access_until_ms FROM gold_alert_preferences p "+
  "JOIN memberships m ON p.email=m.email WHERE m.access_until_ms>? "+
  "AND (p.email_enabled=1 OR p.discord_cipher IS NOT NULL OR p.telegram_chat_id IS NOT NULL) LIMIT 500"
 ).bind(now).all();
 const prefs=members.results||[];
 let sent=0,failed=0;
 // Bounded concurrency keeps provider requests and D1 writes predictable.
 const jobs=[];
 for(const e of events){
  for(const pref of prefs){
   for(const channel of activeChannels(pref,e)){
    if(channel==='email'&&(!env.RESEND_API_KEY||!env.RESEND_FROM_EMAIL))continue;
    if(channel==='discord'&&!env.ALERTS_ENCRYPTION_KEY)continue;
    if(channel==='telegram'&&!env.TELEGRAM_BOT_TOKEN)continue;
    jobs.push(()=>deliver(db,env,e,pref,channel,now));
   }
  }
 }
 for(let i=0;i<jobs.length;i+=8){
  const results=await Promise.allSettled(jobs.slice(i,i+8).map(job=>job()));
  for(const r of results){
   if(r.status==='fulfilled'&&r.value==='sent')sent++;
   if(r.status==='rejected'||r.status==='fulfilled'&&r.value==='failed')failed++;
  }
 }
 await db.prepare("UPDATE gold_alert_state SET updated_ms=? WHERE id=?").bind(now,ID).run();
 return {initialized:false,events:events.length,recipients:prefs.length,sent,failed};
}
export default {
 async scheduled(_controller,env,ctx){
  try{const result=await runAlertScan(env,ctx);if(result.events)console.log('Gold member alert scan',JSON.stringify(result))}
  catch(error){console.error('Gold member alert scan failed',error)}
 },
 async fetch(){return new Response('Not found',{status:404})}
};
