import test from 'node:test';
import assert from 'node:assert/strict';
import {alertReady,activeChannels,discordWebhookUrl,encryptDiscord,decryptDiscord,
 eligibleEvents,signalMessage,publicAlertPreferences,sendAlert} from '../functions/_lib/alerts.js';
import {BAR_MS} from '../functions/_lib/access.js';
import {runAlertScan} from '../workers/alerts.js';
import {onRequestGet,onRequestPost} from '../functions/api/alerts.js';

const validDiscord='https://discord.com/api/webhooks/123456789012345678/'+('Abc_1234567890xyz-'.repeat(3));
test('Discord URL validation accepts only a genuine webhook endpoint',()=>{
 assert.equal(discordWebhookUrl(validDiscord),true);
 for(const candidate of [
  'https://discord.com.evil.example/api/webhooks/123456789012345678/abc',
  'https://evil.example/api/webhooks/123456789012345678/'+('a'.repeat(50)),
  'http://discord.com/api/webhooks/123456789012345678/'+('a'.repeat(50)),
  'https://discord.com@evil.example/api/webhooks/123456789012345678/'+('a'.repeat(50)),
  validDiscord+'?wait=true',
  validDiscord+'#something',
  'https://discord.com/api/webhooks/123/short'
 ])assert.equal(discordWebhookUrl(candidate),false,candidate);
});
test('Discord webhook is encrypted at rest and cannot be decrypted using another key',async()=>{
 const key='a1'.repeat(32),cipher=await encryptDiscord(validDiscord,key);
 assert.notEqual(cipher,validDiscord);
 assert.equal(cipher.includes('discord.com'),false);
 assert.equal(await decryptDiscord(cipher,key),validDiscord);
 assert.equal(await decryptDiscord(cipher,'b2'.repeat(32)),null);
 assert.equal(await decryptDiscord('not-base64',key),null);
 await assert.rejects(encryptDiscord('https://evil.example/hook',key),/Discord/);
});
test('member channels must be enabled before the actual signal close',()=>{
 const time=Date.UTC(2026,10,26,12,0),e={time,type:'ENTRY',side:'LONG',price:4200};
 const prefs={email_enabled:1,email_enabled_ms:time-1000,discord_cipher:'encrypted',
  discord_enabled_ms:time+BAR_MS+1,telegram_chat_id:'123456',telegram_enabled_ms:time+1000};
 assert.deepEqual(activeChannels(prefs,e),['email','telegram']);
});
test('worker ignores old and unconfirmed alerts, including on first deployment',()=>{
 const now=Date.UTC(2026,10,26,13,0);
 const e=time=>({id:'gold-'+time,type:'ENTRY',time,side:'LONG'});
 const old=e(now-110*60000),fresh=e(now-25*60000),stillOpen=e(now-10*60000);
 const list=[old,fresh,stillOpen,{...fresh,type:'OTHER',id:'other'}];
 assert.deepEqual(eligibleEvents(list,now-70*60000,now),[fresh]);
 assert.deepEqual(eligibleEvents(list,fresh.time,now),[]);
});
test('notification content reflects real event price, type and candle closing time',()=>{
 const signal={type:'ENTRY',side:'SHORT',price:4225.35,stop:4267.60,time:Date.UTC(2026,10,26,12,0),reason:'Range breakout'};
 const text=signalMessage(signal);
 assert.match(text,/SELL/);
 assert.match(text,/\$4225.35/);
 assert.match(text,/Stop loss: \$4267.60/);
 assert.match(text,/no fixed TP/i);
 assert.match(text,/notify you when the trade exits/i);
 assert.match(text,/12:15 UTC/);
 assert.match(text,/gold.signaltoscript.com/);
 assert.match(signalMessage(null,{test:true}),/TEST ALERT/);
});
test('settings never disclose the Discord webhook or Telegram chat ID',()=>{
 const row={email_enabled:1,discord_cipher:'secret-cipher',telegram_chat_id:'123456'};
 const p=publicAlertPreferences(row,{RESEND_API_KEY:'r',RESEND_FROM_EMAIL:'a@example.com',
  ALERTS_ENCRYPTION_KEY:'ab'.repeat(32),TELEGRAM_BOT_TOKEN:'token',
  TELEGRAM_WEBHOOK_SECRET:'secret',TELEGRAM_BOT_USERNAME:'goldalertsbot'});
 assert.equal(p.emailEnabled,true);
 assert.equal(p.discordConnected,true);
 assert.equal(p.telegramConnected,true);
 assert.equal(JSON.stringify(p).includes('secret-cipher'),false);
 assert.equal(JSON.stringify(p).includes('123456'),false);
 assert.equal(alertReady({}).email,false);
});
test('first cron run establishes its baseline without dispatching historical signals',async()=>{
 let baselineCalled=false;
 const db={prepare(sql){
  return {bind(...args){this.args=args;return this},async all(){return {results:[{name:'plan'}]}},async run(){
   if(sql.includes('INSERT OR IGNORE INTO gold_alert_state'))baselineCalled=true;
   return {meta:{changes:1}};
  }};
 }};
 const fakeFeed={asOf:new Date(Date.UTC(2026,10,26,12,15)).toISOString(),
  bars:[{time:Date.UTC(2026,10,26,12,0),open:4000,high:4010,low:3995,close:4005}]};
 const result=await runAlertScan({DB:db},{waitUntil(){}},
  {now:Date.UTC(2026,10,26,12,16),feedProvider:async()=>fakeFeed});
 assert.equal(baselineCalled,true);
 assert.deepEqual(result,{initialized:true,events:0,sent:0});
});

test('member notification API denies unauthenticated and cross-origin requests',async()=>{
 const db={prepare(){return {bind(){return this},async all(){return {results:[{name:'plan'}]}},async run(){return {meta:{changes:1}}}}}};
 const origin='https://gold.signaltoscript.com';
 const getResult=await onRequestGet({request:new Request(origin+'/api/alerts'),env:{DB:db}});
 assert.equal(getResult.status,401);
 const crossOrigin=new Request(origin+'/api/alerts',{method:'POST',
  headers:{Origin:'https://another.example','Content-Type':'application/json'},
  body:JSON.stringify({action:'email',enabled:true})});
 const postResult=await onRequestPost({request:crossOrigin,env:{DB:db}});
 assert.equal(postResult.status,403);
});
test('Discord delivery uses encrypted verified destination and disables mentions',async()=>{
 const cipher=await encryptDiscord(validDiscord,'a1'.repeat(32));
 const prev=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,status:204}};
 try{
  await sendAlert({ALERTS_ENCRYPTION_KEY:'a1'.repeat(32)},'discord','member@example.com',
   {discord_cipher:cipher},'GOLD BREAKOUT 15M · BUY');
 }finally{globalThis.fetch=prev}
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,validDiscord);
 assert.deepEqual(JSON.parse(calls[0].options.body).allowed_mentions,{parse:[]});
});
