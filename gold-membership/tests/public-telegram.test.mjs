import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPublicPosts,publicChannelConfig,runPublicChannel} from '../workers/public-telegram.js';
import {BAR_MS,DELAY_MS} from '../functions/_lib/access.js';
const DAY=86400000,HOUR=3600000;
const monday=Date.UTC(2026,10,23)-3*HOUR;
function day(start){
 return Array.from({length:96},(_,i)=>{
  const time=start+i*BAR_MS;
  if(i<28)return {time,open:105,high:110,low:100,close:105};
  if(i===28)return {time,open:109.4,high:112,low:109.3,close:111};
  return {time,open:115,high:116,low:114,close:115};
 });
}
const bars=[...day(monday-3*DAY),...Array.from({length:5},(_,i)=>day(monday+i*DAY)).flat()];
const feed={symbol:'GC=F',bars};
const entry=monday+7*HOUR,release=entry+BAR_MS+DELAY_MS;
test('The public channel cannot disclose entry until a full 30 minutes after candle close',()=>{
 assert.equal(buildPublicPosts(feed,release-1,monday-1).some(p=>p.kind==='signal_entry'),false);
 const posts=buildPublicPosts(feed,release,monday-1);
 const signal=posts.find(p=>p.kind==='signal_entry');
 assert.ok(signal);
 assert.match(signal.text,/BUY \/ LONG/);
 assert.match(signal.text,/Stop loss:/);
 assert.match(signal.text,/EXIT will be notified/);
 assert.match(signal.text,/delayed by at least 30 minutes/);
 assert.match(signal.text,/GC=F/);
 assert.match(signal.reply_markup.inline_keyboard[0][0].url,/plan=monthly&.*utm_source=telegram/);
 assert.ok(!posts.some(p=>p.kind==='signal_exit'));
});
test('Exit posts contain only released trade results and explicitly label modeled P&L',()=>{
 const exitRelease=monday+20*HOUR+BAR_MS+DELAY_MS;
 assert.ok(!buildPublicPosts(feed,exitRelease-1,monday-1).some(p=>p.kind==='signal_exit'));
 const posts=buildPublicPosts(feed,exitRelease,monday-1);
 const exit=posts.find(p=>p.kind==='signal_exit');
 assert.ok(exit);
 assert.match(exit.text,/EXIT LONG/);
 assert.match(exit.text,/Modeled trade result/);
 assert.match(exit.text,/\$100,000 starting capital/);
 assert.ok(posts.some(p=>p.kind==='daily_recap'));
});
test('Fresh activation does not post previously released signals or reports',()=>{
 assert.deepEqual(buildPublicPosts(feed,release,release),[]);
 const posts=buildPublicPosts(feed,release+2*HOUR,monday-1);
 assert.ok(!posts.some(p=>p.kind==='signal_entry'));
});
test('Weekly scorecard requires five observed sessions, not truncated history',()=>{
 const friday=monday+4*DAY,now=friday+21*HOUR;
 const score=buildPublicPosts(feed,now,monday-1).find(p=>p.kind==='weekly_recap');
 assert.ok(score);
 assert.match(score.text,/Closed trades: 5/);
 assert.match(score.text,/Wins: 5 · Losses: 0/);
 assert.match(score.text,/Modeled net P&L/);
 assert.ok(!buildPublicPosts({...feed,bars:bars.filter(b=>b.time>=monday+DAY)},now,monday-1).some(p=>p.kind==='weekly_recap'));
});
test('Public publishing is explicitly opt-in and targets only a named channel',()=>{
 assert.equal(publicChannelConfig({PUBLIC_TELEGRAM_CHANNEL:'@goldroom',TELEGRAM_BOT_TOKEN:'token'}),null);
 assert.equal(publicChannelConfig({PUBLIC_TELEGRAM_ENABLED:'true',PUBLIC_TELEGRAM_CHANNEL:'123456',TELEGRAM_BOT_TOKEN:'token'}),null);
 assert.deepEqual(publicChannelConfig({PUBLIC_TELEGRAM_ENABLED:'true',PUBLIC_TELEGRAM_CHANNEL:'@goldroom',TELEGRAM_BOT_TOKEN:'token'}),{chat:'@goldroom',token:'token'});
});
test('First scan sets baseline and repeated scans do not duplicate posted messages',async()=>{
 const state=new Map(),claims=new Set(),messages=[];
 const db={prepare(sql){let args=[];return {
  bind(...a){args=a;return this},
  async first(){return {started_ms:state.get(args[0])}},
  async run(){
   if(sql.includes('INSERT OR IGNORE INTO gold_public_channel_state')){
    if(!state.has(args[0]))state.set(args[0],args[1]);
   }
   if(sql.includes('INSERT OR IGNORE INTO gold_public_channel_posts')){
    const key=args[0]+':'+args[1];if(claims.has(key))return {meta:{changes:0}};
    claims.add(key);return {meta:{changes:1}};
   }
   return {meta:{changes:1}};
  }
 }}};
 const env={DB:db,PUBLIC_TELEGRAM_ENABLED:'true',PUBLIC_TELEGRAM_CHANNEL:'@goldroom',TELEGRAM_BOT_TOKEN:'token'};
 const sender=async(c,p)=>messages.push(p);
 await runPublicChannel(env,feed,release-1000,sender);
 assert.equal(messages.length,0);
 await runPublicChannel(env,feed,release,sender);
 const count=messages.length;assert.ok(count>=1);
 await runPublicChannel(env,feed,release+1000,sender);
 assert.equal(messages.length,count);
});
