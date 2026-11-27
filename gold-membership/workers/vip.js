import {ensureSchema,BAR_MS} from '../functions/_lib/access.js';
import {eligibleEvents,signalMessage} from '../functions/_lib/alerts.js';
import {runGoldBreakout} from '../functions/_lib/gold-market.js';

export const validVipChat=id=>/^-100[0-9]{8,17}$/.test(String(id||''));
export const vipReady=env=>env.VIP_TELEGRAM_ENABLED==='true'&&validVipChat(env.VIP_TELEGRAM_CHANNEL)&&!!env.TELEGRAM_BOT_TOKEN;
export async function ensureVipSchema(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS gold_vip_state(id TEXT PRIMARY KEY,started_bar_ms INTEGER NOT NULL,updated_ms INTEGER NOT NULL)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS gold_vip_posts(event_id TEXT PRIMARY KEY,status TEXT NOT NULL,updated_ms INTEGER NOT NULL)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS gold_vip_invites(email TEXT NOT NULL,chat_id TEXT NOT NULL,invite_link TEXT NOT NULL UNIQUE,created_ms INTEGER NOT NULL,expires_ms INTEGER NOT NULL,used_ms INTEGER,PRIMARY KEY(email,created_ms))").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS gold_vip_invite_link ON gold_vip_invites(invite_link)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS gold_vip_members(email TEXT PRIMARY KEY,chat_id TEXT NOT NULL,joined_ms INTEGER NOT NULL,removed_ms INTEGER)").run();
}
export async function telegramVip(env,method,body){
 const r=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/'+method,{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(9000)});
 if(!r.ok)throw Error('Telegram VIP '+method+' returned HTTP '+r.status);
 const data=await r.json();
 if(!data?.ok)throw Error('Telegram VIP '+method+' was declined');
 return data.result;
}
export async function vipInvite(db,env,email,now=Date.now(),send=telegramVip){
 if(!vipReady(env))throw Error('VIP channel setup is pending');
 await ensureVipSchema(db);
 const row=await db.prepare(
  "SELECT p.telegram_chat_id,m.access_until_ms FROM gold_alert_preferences p "+
  "JOIN memberships m ON m.email=p.email WHERE p.email=? AND m.access_until_ms>?"
 ).bind(email,now).first();
 if(!/^[0-9]{4,20}$/.test(String(row?.telegram_chat_id||'')))throw Error('Connect the VIP Telegram bot in alert settings first');
 const prior=await db.prepare("SELECT created_ms FROM gold_vip_invites WHERE email=? ORDER BY created_ms DESC LIMIT 1").bind(email).first();
 if(Number(prior?.created_ms)>now-5*60000)throw Error('Invite recently created. Open your previous link or retry in five minutes');
 const result=await send(env,'createChatInviteLink',{chat_id:env.VIP_TELEGRAM_CHANNEL,
  expire_date:Math.floor((now+10*60000)/1000),member_limit:1,name:'VIP access'});
 if(!/^https:\/\/t\.me\/\+[a-zA-Z0-9_-]{12,}$/.test(String(result?.invite_link||'')))throw Error('VIP invite link unavailable');
 await db.prepare("INSERT INTO gold_vip_invites(email,chat_id,invite_link,created_ms,expires_ms) VALUES(?,?,?,?,?)")
  .bind(email,String(row.telegram_chat_id),result.invite_link,now,now+10*60000).run();
 return result.invite_link;
}
export async function vipMemberJoined(db,env,update,now=Date.now()){
 if(!vipReady(env)||String(update?.chat?.id)!==String(env.VIP_TELEGRAM_CHANNEL))return false;
 const status=update?.new_chat_member?.status;
 if(!['member','administrator','creator'].includes(status))return false;
 const id=String(update?.new_chat_member?.user?.id||''),link=update?.invite_link?.invite_link;
 if(!/^[0-9]{4,20}$/.test(id)||!link)return false;
 await ensureVipSchema(db);
 const invite=await db.prepare(
  "SELECT i.email FROM gold_vip_invites i JOIN memberships m ON m.email=i.email "+
  "WHERE i.invite_link=? AND i.chat_id=? AND i.used_ms IS NULL AND i.expires_ms>? AND m.access_until_ms>?"
 ).bind(link,id,now,now).first();
 if(!invite){
  // A forwarded invite must not retain VIP access for the wrong Telegram user.
  await telegramVip(env,'banChatMember',{chat_id:env.VIP_TELEGRAM_CHANNEL,user_id:Number(id)})
   .then(()=>telegramVip(env,'unbanChatMember',{chat_id:env.VIP_TELEGRAM_CHANNEL,user_id:Number(id),only_if_banned:true}))
   .catch(()=>console.error('Could not remove invalid VIP join'));
  return false;
 }
 await db.batch([
  db.prepare("UPDATE gold_vip_invites SET used_ms=? WHERE invite_link=? AND used_ms IS NULL").bind(now,link),
  db.prepare("INSERT INTO gold_vip_members(email,chat_id,joined_ms,removed_ms) VALUES(?,?,?,NULL) ON CONFLICT(email) DO UPDATE SET chat_id=excluded.chat_id,joined_ms=excluded.joined_ms,removed_ms=NULL").bind(invite.email,id,now)
 ]);
 return true;
}
export async function pruneVipMembers(db,env,now=Date.now(),send=telegramVip){
 const rows=await db.prepare(
  "SELECT v.email,v.chat_id FROM gold_vip_members v LEFT JOIN memberships m ON m.email=v.email "+
  "LEFT JOIN gold_alert_preferences p ON p.email=v.email WHERE v.removed_ms IS NULL AND "+
  "(m.access_until_ms IS NULL OR m.access_until_ms<=? OR p.telegram_chat_id IS NULL OR p.telegram_chat_id!=v.chat_id)"
 ).bind(now).all();
 let removed=0;
 for(const member of rows.results||[]){
  try{
   await send(env,'banChatMember',{chat_id:env.VIP_TELEGRAM_CHANNEL,user_id:Number(member.chat_id)});
   await send(env,'unbanChatMember',{chat_id:env.VIP_TELEGRAM_CHANNEL,user_id:Number(member.chat_id),only_if_banned:true});
   await db.prepare("UPDATE gold_vip_members SET removed_ms=? WHERE email=? AND chat_id=? AND removed_ms IS NULL").bind(now,member.email,member.chat_id).run();removed++;
  }catch{console.error('Failed to remove expired VIP Telegram member')}
 }
 return removed;
}
export async function runVipChannel(env,feed,now=Date.now(),send=telegramVip){
 if(!vipReady(env))return {enabled:false,sent:0};
 const db=env.DB;await ensureSchema(db);await ensureVipSchema(db);
 const latest=feed.bars.at(-1)?.time;
 if(!Number.isFinite(latest))throw Error('No Gold candles');
 const started=await db.prepare("INSERT OR IGNORE INTO gold_vip_state(id,started_bar_ms,updated_ms) VALUES('vip',?,?)").bind(latest,now).run();
 if(started.meta?.changes===1)return {enabled:true,initialized:true,sent:0};
 const baseline=await db.prepare("SELECT started_bar_ms FROM gold_vip_state WHERE id='vip'").first();
 const events=eligibleEvents(runGoldBreakout(feed.bars).events,Number(baseline?.started_bar_ms)||latest,now);
 let sent=0;
 for(const e of events){
  const claim=await db.prepare("INSERT OR IGNORE INTO gold_vip_posts(event_id,status,updated_ms) VALUES(?,'sending',?)").bind(e.id,now).run();
  if(claim.meta?.changes!==1)continue;
  try{
   await send(env,'sendMessage',{chat_id:env.VIP_TELEGRAM_CHANNEL,
    text:signalMessage(e),link_preview_options:{is_disabled:true}});
   await db.prepare("UPDATE gold_vip_posts SET status='sent',updated_ms=? WHERE event_id=?").bind(Date.now(),e.id).run();sent++;
  }catch{await db.prepare("UPDATE gold_vip_posts SET status='failed',updated_ms=? WHERE event_id=?").bind(Date.now(),e.id).run();console.error('VIP channel alert failed',e.id)}
 }
 await pruneVipMembers(db,env,now,send);
 await db.prepare("UPDATE gold_vip_state SET updated_ms=? WHERE id='vip'").bind(now).run();
 return {enabled:true,sent};
}
