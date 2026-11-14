// In-memory regression test for the one-per-browser guest quota and Google member bypass.
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {onRequestGet as download} from '../functions/api/download.js';
import {onRequestGet as access} from '../functions/api/access.js';
import {onRequest as protectStatic} from '../functions/scripts/_middleware.js';
import {hashToken} from '../functions/_lib/download-access.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

const guestRows=new Set();
const members=new Set();
let totalDownloads=0;
const db={
 prepare(sql){
  let args=[];
  const query={
   bind(...params){args=params;return query},
   async run(){
    if(sql.includes('CREATE TABLE IF NOT EXISTS'))return {meta:{changes:0}};
    if(sql.includes('INSERT OR IGNORE INTO free_guest_downloads')){
      if(guestRows.has(args[0]))return {meta:{changes:0}};
      guestRows.add(args[0]);
      return {meta:{changes:1}};
    }
    if(sql.includes('INSERT INTO script_downloads')){totalDownloads++;return {meta:{changes:1}}}
    throw Error('Unexpected run: '+sql);
   },
   async first(){
    if(sql.includes('FROM free_guest_downloads'))return guestRows.has(args[0])?{token_hash:args[0]}:null;
    if(sql.includes('FROM free_google_sessions'))return members.has(args[0])?{google_sub:'test-account'}:null;
    throw Error('Unexpected first: '+sql);
   }
  };
  return query;
 }
};
const env={DB:db,ASSETS:{fetch:async()=>new Response('//@version=6\nstrategy("demo")',{status:200})}};
const request=(endpoint,cookie='')=>new Request('https://signaltoscript.com'+endpoint,{headers:cookie?{Cookie:cookie}:{}});
const script='supertrend-dema-reversal';
const url='/api/download?script='+script;

const first=await download({request:request(url),env});
assert.equal(first.status,200,'first guest download should succeed');
const setCookie=first.headers.get('Set-Cookie');
assert.match(setCookie,/^sts_free_guest=[0-9a-f]{64}; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=15552000$/);
const cookie=setCookie.split(';')[0];
assert.equal(guestRows.size,1);
const afterFirst=await access({request:request('/api/access',cookie),env});
const afterBody=await afterFirst.json();
assert.equal(afterBody.member,false);
assert.equal(afterBody.guestUsed,true);
assert.equal(afterBody.guestLimit,1);

const second=await download({request:request(url,cookie),env});
assert.equal(second.status,403,'second guest download should be blocked');
assert.equal((await second.json()).code,'GUEST_LIMIT_REACHED');
assert.equal(guestRows.size,1);
assert.equal(totalDownloads,1);

const fresh=await access({request:request('/api/access'),env});
assert.equal((await fresh.json()).guestUsed,false,'new browser has a separate guest quota');

const memberToken='a'.repeat(64);
members.add(await hashToken(memberToken));
const memberCookie='__Host-sts_google='+memberToken;
const memberStatus=await access({request:request('/api/access',memberCookie),env});
assert.equal((await memberStatus.json()).member,true);
for(let i=0;i<2;i++){
 const result=await download({request:request(url,memberCookie),env});
 assert.equal(result.status,200,'Google members should have unlimited downloads');
}
assert.equal(guestRows.size,1,'member downloads do not consume guest quota');
assert.equal(totalDownloads,3);

const missing=await download({request:request(url),env:{...env,SCRIPT_BUCKET:{get:async()=>null}}});
assert.equal(missing.status,503,'missing private object must not consume guest access');
assert.equal(guestRows.size,1);

const directGuest=await protectStatic({request:request('/scripts/'+script+'.pine',cookie),env,next:async()=>new Response('file')});
assert.equal(directGuest.status,401,'direct static path must not bypass guest quota');
const directMember=await protectStatic({request:request('/scripts/'+script+'.pine',memberCookie),env,next:async()=>new Response('file')});
assert.equal(directMember.status,200);
const directPrivate=await protectStatic({request:request('/scripts/'+script+'.pine',memberCookie),env:{...env,SCRIPT_BUCKET:{}},next:async()=>new Response('file')});
assert.equal(directPrivate.status,404,'private bucket blocks static fallback');
const noDatabase=await download({request:request(url),env:{ASSETS:env.ASSETS}});
assert.equal(noDatabase.status,503,'missing D1 must fail closed');
console.log('Guest download tests passed: first download, repeat blocked, members unlimited, R2 and direct route guards.');
