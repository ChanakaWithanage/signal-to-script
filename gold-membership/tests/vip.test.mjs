import test from 'node:test';
import assert from 'node:assert/strict';
import {validVipChat,vipReady,vipInvite,vipMemberJoined,pruneVipMembers,
 runVipChannel} from '../workers/vip.js';
import {runGoldBreakout} from '../functions/_lib/gold-market.js';
const env={VIP_TELEGRAM_ENABLED:'true',VIP_TELEGRAM_CHANNEL:'-1001234567890',TELEGRAM_BOT_TOKEN:'testing'};
test('Private VIP channel requires an explicitly enabled numeric channel ID and bot',()=>{
 assert.equal(validVipChat('-1001234567890'),true);
 assert.equal(validVipChat('@publicgold'),false);
 assert.equal(vipReady(env),true);
 assert.equal(vipReady({...env,VIP_TELEGRAM_ENABLED:'false'}),false);
 assert.equal(vipReady({...env,VIP_TELEGRAM_CHANNEL:'@publicgold'}),false);
 assert.equal(vipReady({...env,TELEGRAM_BOT_TOKEN:''}),false);
});
test('VIP invite requires connected Telegram identity, membership and rate-limits repeat links',async()=>{
 const now=Date.now(),saved=[],calls=[];
 let last=null;
 const db={prepare(sql){
  let a=[];
  return {bind(...args){a=args;return this},async run(){saved.push({sql,a});return {meta:{changes:1}}},
   async first(){
    if(sql.includes('SELECT p.telegram_chat_id'))return {telegram_chat_id:'12345678',access_until_ms:now+86400000};
    if(sql.includes('SELECT created_ms FROM gold_vip_invites'))return last?{created_ms:last}:null;
    return null;
   }};
 }};
 const sender=async(_env,method,body)=>{
  calls.push({method,body});last=now;
  return {invite_link:'https://t.me/+1234567890abcdefgh'};
 };
 const link=await vipInvite(db,env,'member@example.com',now,sender);
 assert.match(link,/^https:\/\/t\.me\/\+/);
 assert.equal(calls[0].method,'createChatInviteLink');
 assert.equal(calls[0].body.member_limit,1);
 assert.ok(calls[0].body.expire_date<=Math.floor(now/1000)+601);
 assert.ok(saved.some(s=>s.sql.includes('INSERT INTO gold_vip_invites')));
 await assert.rejects(vipInvite(db,env,'member@example.com',now+1000,sender),/recently created/);
});
test('Expired connected VIP members are removed from the private channel',async()=>{
 const now=Date.now(),calls=[];
 const db={prepare(sql){
  let a=[];
  return {bind(...x){a=x;return this},
   async all(){return {results:[{email:'expired@example.com',chat_id:'12345678'}]}},
   async run(){return {meta:{changes:1}}}};
 }};
 const sender=async(_env,method,data)=>{calls.push({method,data});return true};
 assert.equal(await pruneVipMembers(db,env,now,sender),1);
 assert.deepEqual(calls.map(c=>c.method),['banChatMember','unbanChatMember']);
 assert.equal(calls[0].data.user_id,12345678);
});
test('VIP feed uses confirmed entry stop-loss and sends no past signals on activation',()=>{
 const start=Date.UTC(2026,10,23,21);
 const bars=Array.from({length:96},(_,i)=>{
  const time=start+i*900000;
  return i<28?{time,open:105,high:110,low:100,close:105}:
   i===28?{time,open:109.4,high:112,low:109.3,close:111}:
   {time,open:115,high:116,low:114,close:115};
 });
 const event=runGoldBreakout(bars).events.find(e=>e.type==='ENTRY');
 assert.ok(event);
 assert.ok(event.stop>0);
 assert.ok(event.stop<event.price);
});
