import {BAR_MS,digest,randomHex} from './access.js';

// Shared by Cloudflare Pages and the scheduled alert Worker.
let schemaPromise;
export async function ensureAlertsSchema(db){
 if(!db)throw Error('D1 database not configured');
 if(!schemaPromise)schemaPromise=(async()=>{
  await db.prepare("CREATE TABLE IF NOT EXISTS gold_alert_preferences(email TEXT PRIMARY KEY,email_enabled INTEGER NOT NULL DEFAULT 0,discord_cipher TEXT,telegram_chat_id TEXT,telegram_connect_hash TEXT,telegram_connect_expires_ms INTEGER,email_enabled_ms INTEGER,discord_enabled_ms INTEGER,telegram_enabled_ms INTEGER,updated_ms INTEGER NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS gold_alert_state(id TEXT PRIMARY KEY,started_bar_ms INTEGER NOT NULL,updated_ms INTEGER NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS gold_alert_deliveries(event_id TEXT NOT NULL,email TEXT NOT NULL,channel TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 1,last_error TEXT,updated_ms INTEGER NOT NULL,PRIMARY KEY(event_id,email,channel))").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS gold_alert_test_limits(email TEXT NOT NULL,channel TEXT NOT NULL,last_test_ms INTEGER NOT NULL,PRIMARY KEY(email,channel))").run();
 })();
 try{await schemaPromise}catch(error){schemaPromise=null;throw error}
}
export async function ensureAlertPreferences(db,email){
 await db.prepare("INSERT INTO gold_alert_preferences(email,updated_ms) VALUES(?,?) ON CONFLICT(email) DO NOTHING").bind(email,Date.now()).run();
 return alertPreferences(db,email);
}
export async function alertPreferences(db,email){
 return db.prepare("SELECT email_enabled,discord_cipher,telegram_chat_id,updated_ms,email_enabled_ms,discord_enabled_ms,telegram_enabled_ms FROM gold_alert_preferences WHERE email=?").bind(email).first();
}
export function discordWebhookUrl(value){
 if(typeof value!=='string'||value.length>450)return false;
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&u.hostname==='discord.com'&&!u.port&&
   !u.username&&!u.password&&!u.search&&!u.hash&&
   /^\/api\/webhooks\/\d{10,25}\/[A-Za-z0-9_-]{20,}$/.test(u.pathname);
 }catch{return false}
}
function secretBytes(secret){
 if(typeof secret!=='string'||!/^[a-f0-9]{64}$/i.test(secret))
  throw Error('Discord encryption secret is not configured');
 return Uint8Array.from(secret.match(/../g),part=>Number.parseInt(part,16));
}
export async function encryptDiscord(value,secret){
 if(!discordWebhookUrl(value))throw Error('Enter a valid Discord webhook URL');
 const key=await crypto.subtle.importKey('raw',secretBytes(secret),'AES-GCM',false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(value)));
 const result=new Uint8Array(iv.length+cipher.length);result.set(iv);result.set(cipher,iv.length);
 return btoa(String.fromCharCode(...result));
}
export async function decryptDiscord(value,secret){
 if(typeof value!=='string'||value.length>1500)return null;
 try{
  const bytes=Uint8Array.from(atob(value),ch=>ch.charCodeAt(0));
  if(bytes.length<29)return null;
  const key=await crypto.subtle.importKey('raw',secretBytes(secret),'AES-GCM',false,['decrypt']);
  const text=new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},key,bytes.slice(12)));
  return discordWebhookUrl(text)?text:null;
 }catch{return null}
}
export function alertReady(env){
 const username=String(env.TELEGRAM_BOT_USERNAME||'').replace(/^@/,'');
 return {
  email:!!(env.RESEND_API_KEY&&env.RESEND_FROM_EMAIL),
  discord:/^[0-9a-f]{64}$/i.test(env.ALERTS_ENCRYPTION_KEY||''),
  telegram:!!env.TELEGRAM_BOT_TOKEN&&!!env.TELEGRAM_WEBHOOK_SECRET&&/^[a-z0-9_]{5,32}$/i.test(username),
  telegramUsername:username
 };
}
export function publicAlertPreferences(row,env){
 const ready=alertReady(env);
 return {emailEnabled:!!row?.email_enabled,discordConnected:!!row?.discord_cipher,
  telegramConnected:!!row?.telegram_chat_id,
  available:{email:ready.email,discord:ready.discord,telegram:ready.telegram},
  telegramBot:ready.telegram?ready.telegramUsername:null};
}
export function alertTitle(e){return e.type==='EXIT'?'EXIT '+e.side:e.side==='LONG'?'BUY':'SELL'}
export function signalMessage(e,{siteUrl='https://gold.signaltoscript.com',test=false}={}){
 if(test)return 'GOLD SIGNAL ROOM VIP · TEST ALERT\n\nYour instant VIP alerts are connected.\n'+siteUrl;
 if(!Number.isFinite(Number(e.price)))throw Error('Invalid Gold price');
 const time=new Date(Number(e.time)+BAR_MS);
 const stop=e.type==='ENTRY'&&Number.isFinite(Number(e.stop))?'\nStop loss: $'+Number(e.stop).toFixed(2):'';
 const follow=e.type==='ENTRY'?'\nTake profit: strategy-managed, no fixed TP. We will notify you when the trade exits.':
  '\nTrade closed. The next entry will be notified when confirmed.';
 return '🥇 GOLD SIGNAL ROOM VIP · '+alertTitle(e)+'\n\nPrice: $'+Number(e.price).toFixed(2)+stop+follow+
  '\nCandle closed: '+time.toISOString().replace('T',' ').slice(0,16)+' UTC'+
  '\nReason: '+String(e.reason||'Gold signal').slice(0,90)+
  '\n\nVIP live dashboard: '+siteUrl;
}

async function postJson(url,payload,headers={}){
 const response=await fetch(url,{method:'POST',
  headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(payload),
  signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Provider HTTP '+response.status);
}
export async function sendAlert(env,channel,email,pref,message){
 if(channel==='email'){
  if(!env.RESEND_API_KEY||!env.RESEND_FROM_EMAIL)throw Error('Email delivery not configured');
  await postJson('https://api.resend.com/emails',{
   from:env.RESEND_FROM_EMAIL,to:[email],
   subject:message.includes('TEST ALERT')?'Gold Signals · Test notification':message.split('\n')[0],text:message
  },{Authorization:'Bearer '+env.RESEND_API_KEY});
 }else if(channel==='discord'){
  const url=await decryptDiscord(pref.discord_cipher,env.ALERTS_ENCRYPTION_KEY);
  if(!url)throw Error('Discord webhook is invalid or disconnected');
  await postJson(url,{username:'Gold Signal Room',content:message,allowed_mentions:{parse:[]}});
 }else if(channel==='telegram'){
  if(!env.TELEGRAM_BOT_TOKEN||!/^-?[0-9]{4,20}$/.test(String(pref.telegram_chat_id||'')))
   throw Error('Telegram bot is not connected');
  await postJson('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',
   {chat_id:pref.telegram_chat_id,text:message,disable_web_page_preview:true});
 }else throw Error('Unknown alert channel');
}
export async function createTelegramLink(db,email,env){
 const {telegram,telegramUsername}=alertReady(env);
 if(!telegram)throw Error('Telegram alerts are not configured yet');
 const code=randomHex(16),now=Date.now();
 await db.prepare("UPDATE gold_alert_preferences SET telegram_connect_hash=?,telegram_connect_expires_ms=?,updated_ms=? WHERE email=?")
  .bind(await digest(code),now+15*60000,now,email).run();
 return 'https://t.me/'+telegramUsername+'?start='+code;
}
export async function claimTestSend(db,email,channel,now=Date.now()){
 const result=await db.prepare("INSERT INTO gold_alert_test_limits(email,channel,last_test_ms) VALUES(?,?,?) ON CONFLICT(email,channel) DO UPDATE SET last_test_ms=excluded.last_test_ms WHERE gold_alert_test_limits.last_test_ms<=?")
  .bind(email,channel,now,now-10*60000).run();
 return result.meta?.changes===1;
}
export function eligibleEvents(events,startMs,now=Date.now(),windowMs=90*60000){
 return (events||[]).filter(e=>(e.type==='ENTRY'||e.type==='EXIT')&&
  Number.isFinite(e.time)&&e.time>startMs&&e.time+BAR_MS<=now&&
  now-(e.time+BAR_MS)<=windowMs);
}
export function activeChannels(p,e){
 const t=e.time+BAR_MS,channels=[];
 if(p.email_enabled&&p.email_enabled_ms&&p.email_enabled_ms<=t)channels.push('email');
 if(p.discord_cipher&&p.discord_enabled_ms&&p.discord_enabled_ms<=t)channels.push('discord');
 if(p.telegram_chat_id&&p.telegram_enabled_ms&&p.telegram_enabled_ms<=t)channels.push('telegram');
 return channels;
}
async function postJson(url,payload,headers={}){
 const response=await fetch(url,{method:'POST',
  headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(payload),
  signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Provider HTTP '+response.status);
}
export async function sendAlert(env,channel,email,pref,message){
 if(channel==='email'){
  if(!env.RESEND_API_KEY||!env.RESEND_FROM_EMAIL)throw Error('Email delivery not configured');
  await postJson('https://api.resend.com/emails',{
   from:env.RESEND_FROM_EMAIL,to:[email],
   subject:message.includes('TEST ALERT')?'Gold Signals · Test notification':message.split('\n')[0],text:message
  },{Authorization:'Bearer '+env.RESEND_API_KEY});
 }else if(channel==='discord'){
  const url=await decryptDiscord(pref.discord_cipher,env.ALERTS_ENCRYPTION_KEY);
  if(!url)throw Error('Discord webhook is invalid or disconnected');
  await postJson(url,{username:'Gold Signal Room',content:message,allowed_mentions:{parse:[]}});
 }else if(channel==='telegram'){
  if(!env.TELEGRAM_BOT_TOKEN||!/^-?[0-9]{4,20}$/.test(String(pref.telegram_chat_id||'')))
   throw Error('Telegram bot is not connected');
  await postJson('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',
   {chat_id:pref.telegram_chat_id,text:message,disable_web_page_preview:true});
 }else throw Error('Unknown alert channel');
}
export async function createTelegramLink(db,email,env){
 const {telegram,telegramUsername}=alertReady(env);
 if(!telegram)throw Error('Telegram alerts are not configured yet');
 const code=randomHex(16),now=Date.now();
 await db.prepare("UPDATE gold_alert_preferences SET telegram_connect_hash=?,telegram_connect_expires_ms=?,updated_ms=? WHERE email=?")
  .bind(await digest(code),now+15*60000,now,email).run();
 return 'https://t.me/'+telegramUsername+'?start='+code;
}
export async function claimTestSend(db,email,channel,now=Date.now()){
 const result=await db.prepare("INSERT INTO gold_alert_test_limits(email,channel,last_test_ms) VALUES(?,?,?) ON CONFLICT(email,channel) DO UPDATE SET last_test_ms=excluded.last_test_ms WHERE gold_alert_test_limits.last_test_ms<=?")
  .bind(email,channel,now,now-10*60000).run();
 return result.meta?.changes===1;
}
export function eligibleEvents(events,startMs,now=Date.now(),windowMs=90*60000){
 return (events||[]).filter(e=>(e.type==='ENTRY'||e.type==='EXIT')&&
  Number.isFinite(e.time)&&e.time>startMs&&e.time+BAR_MS<=now&&
  now-(e.time+BAR_MS)<=windowMs);
}
export function activeChannels(p,e){
 const t=e.time+BAR_MS,channels=[];
 if(p.email_enabled&&p.email_enabled_ms&&p.email_enabled_ms<=t)channels.push('email');
 if(p.discord_cipher&&p.discord_enabled_ms&&p.discord_enabled_ms<=t)channels.push('discord');
 if(p.telegram_chat_id&&p.telegram_enabled_ms&&p.telegram_enabled_ms<=t)channels.push('telegram');
 return channels;
}
+Number(e.price).toFixed(2)+stop+follow+
  '\nCandle closed: '+time.toISOString().replace('T',' ').slice(0,16)+' UTC'+
  '\nReason: '+String(e.reason||'Gold signal').slice(0,90)+
  '\n\nVIP live dashboard: '+siteUrl;
}
async function postJson(url,payload,headers={}){
 const response=await fetch(url,{method:'POST',
  headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(payload),
  signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Provider HTTP '+response.status);
}
export async function sendAlert(env,channel,email,pref,message){
 if(channel==='email'){
  if(!env.RESEND_API_KEY||!env.RESEND_FROM_EMAIL)throw Error('Email delivery not configured');
  await postJson('https://api.resend.com/emails',{
   from:env.RESEND_FROM_EMAIL,to:[email],
   subject:message.includes('TEST ALERT')?'Gold Signals · Test notification':message.split('\n')[0],text:message
  },{Authorization:'Bearer '+env.RESEND_API_KEY});
 }else if(channel==='discord'){
  const url=await decryptDiscord(pref.discord_cipher,env.ALERTS_ENCRYPTION_KEY);
  if(!url)throw Error('Discord webhook is invalid or disconnected');
  await postJson(url,{username:'Gold Signal Room',content:message,allowed_mentions:{parse:[]}});
 }else if(channel==='telegram'){
  if(!env.TELEGRAM_BOT_TOKEN||!/^-?[0-9]{4,20}$/.test(String(pref.telegram_chat_id||'')))
   throw Error('Telegram bot is not connected');
  await postJson('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',
   {chat_id:pref.telegram_chat_id,text:message,disable_web_page_preview:true});
 }else throw Error('Unknown alert channel');
}
export async function createTelegramLink(db,email,env){
 const {telegram,telegramUsername}=alertReady(env);
 if(!telegram)throw Error('Telegram alerts are not configured yet');
 const code=randomHex(16),now=Date.now();
 await db.prepare("UPDATE gold_alert_preferences SET telegram_connect_hash=?,telegram_connect_expires_ms=?,updated_ms=? WHERE email=?")
  .bind(await digest(code),now+15*60000,now,email).run();
 return 'https://t.me/'+telegramUsername+'?start='+code;
}
export async function claimTestSend(db,email,channel,now=Date.now()){
 const result=await db.prepare("INSERT INTO gold_alert_test_limits(email,channel,last_test_ms) VALUES(?,?,?) ON CONFLICT(email,channel) DO UPDATE SET last_test_ms=excluded.last_test_ms WHERE gold_alert_test_limits.last_test_ms<=?")
  .bind(email,channel,now,now-10*60000).run();
 return result.meta?.changes===1;
}
export function eligibleEvents(events,startMs,now=Date.now(),windowMs=90*60000){
 return (events||[]).filter(e=>(e.type==='ENTRY'||e.type==='EXIT')&&
  Number.isFinite(e.time)&&e.time>startMs&&e.time+BAR_MS<=now&&
  now-(e.time+BAR_MS)<=windowMs);
}
export function activeChannels(p,e){
 const t=e.time+BAR_MS,channels=[];
 if(p.email_enabled&&p.email_enabled_ms&&p.email_enabled_ms<=t)channels.push('email');
 if(p.discord_cipher&&p.discord_enabled_ms&&p.discord_enabled_ms<=t)channels.push('discord');
 if(p.telegram_chat_id&&p.telegram_enabled_ms&&p.telegram_enabled_ms<=t)channels.push('telegram');
 return channels;
}
