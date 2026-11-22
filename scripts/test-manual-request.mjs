// Mocked Cloudflare Pages request form tests; no real email or checkout activity.
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {onRequestPost as premium} from '../functions/api/premium.js';
import {onRequestPost} from '../functions/api/manual-request.js';
globalThis.crypto??=webcrypto;

const originalFetch=globalThis.fetch;
const saved=new Map();
const db={prepare(sql){
 let args=[];
 const query={
  bind(...v){args=v;return query},
  async run(){
   if(sql.startsWith('ALTER TABLE')||sql.startsWith('UPDATE premium_nowpayments_orders SET')||sql.startsWith('CREATE TABLE')||sql.startsWith('CREATE INDEX'))
    return {meta:{changes:0}};
   if(sql.includes('INSERT INTO premium_manual_requests')){
    const [id,email,slug,product,price_usd,message,session_id,
     visitor_country,visitor_region,visitor_city,visitor_timezone,
     browser_timezone,created_ms,created_at_utc,created_at_ist]=args;
    saved.set(id,{id,email,slug,product,price_usd,message,session_id,
     visitor_country,visitor_region,visitor_city,visitor_timezone,
     browser_timezone,created_ms,created_at_utc,created_at_ist,
     status:'new',notify_status:'not_configured'});
    return {meta:{changes:1}};
   }
   if(sql.includes('UPDATE premium_manual_requests SET notify_status')){
    const row=saved.get(args[0]);if(row)row.notify_status=sql.includes("'sent'")?'sent':'failed';
    return {meta:{changes:row?1:0}};
   }
   throw Error('Unexpected SQL write: '+sql);
  },
  async first(){
   if(sql.startsWith('SELECT id,slug,status,price_usd,created_ms')){
    const row=saved.get(args[0]);return row?.slug===args[1]?row:null;
   }
   if(sql.includes('SELECT COUNT(*) AS total')){
    const [email,since]=args;
    const matches=[...saved.values()].filter(x=>x.email===email&&x.created_ms>since);
    return {total:matches.length,latest:Math.max(0,...matches.map(x=>x.created_ms))};
   }
   throw Error('Unexpected SQL read: '+sql);
  }
 };return query;
}};
const origin='https://signaltoscript.com';
const env={DB:db};
const request=(body,originHeader=origin)=>{
 const req=new Request(origin+'/api/manual-request',{method:'POST',
  headers:{'Origin':originHeader,'Content-Type':'application/json'},
  body:JSON.stringify(body)});
 Object.defineProperty(req,'cf',{value:{country:'US',region:'California',
  city:'San Francisco',timezone:'America/Los_Angeles'}});
 return req;
};
const attempt=(body,environment=env,originHeader=origin)=>
 onRequestPost({request:request(body,originHeader),env:environment});
const valid={slug:'gold-breakout-15m',email:'Customer@Example.com',
 sessionId:'923054b9-2465-443d-9719-61e0f37eef6a',
 browserTimezone:'America/Los_Angeles'};
try{
 let response=await attempt(valid,{});
 assert.equal(response.status,503,'D1 binding required');
 response=await attempt(valid,env,'https://malicious.example');
 assert.equal(response.status,403,'cross origin blocked');
 response=await attempt({...valid,slug:'invalid'});
 assert.equal(response.status,400,'script must be in catalog');
 response=await attempt({...valid,email:'invalid'});
 assert.equal(response.status,400,'valid email required');
 response=await attempt({...valid,website:'filled-by-a-bot'});
 assert.equal(response.status,200,'honeypot ignored');
 assert.equal(saved.size,0,'honeypot creates no records');
 response=await attempt(valid);
 assert.equal(response.status,201,'one-field request submitted');
 const body=await response.json();
 assert.equal(body.received,true);
 assert.match(body.requestId,/^[a-f0-9-]{36}$/);
 assert.equal(saved.size,1);
 const row=saved.get(body.requestId);
 assert.equal(row.email,'customer@example.com');
 assert.equal(row.product,'Signal to Script Lifetime Membership');
 assert.equal(row.price_usd,'4.99');
 const download=secret=>premium({request:request({method:'manual',action:'download',id:row.id,secret,slug:'supertrend-dema-reversal'}),env:{DB:db,PREMIUM_BUCKET:{get:async key=>({body:key})}}});
 assert.equal((await download(body.secret)).status,403);
 row.status='paid';
 assert.equal(await (await download(body.secret)).text(),'supertrend-dema-reversal.pine');
 assert.equal((await download('0'.repeat(64))).status,403);
 assert.match(row.message,/Gold Breakout 15M Strategy/);
 assert.equal(row.visitor_country,'US');
 assert.equal(row.visitor_region,'California');
 assert.equal(row.browser_timezone,'America/Los_Angeles');
 assert.match(row.created_at_utc,/Z$/);
 assert.match(row.created_at_ist,/\+05:30$/);
 response=await attempt(valid);
 assert.equal(response.status,429,'double click prevented');
 // Without configured email secrets, request is still saved to D1.
 assert.equal(row.notify_status,'not_configured');
 globalThis.fetch=async (url,options={})=>{
  assert.equal(url,'https://api.resend.com/emails');
  assert.equal(options.method,'POST');
  const content=JSON.parse(options.body);
  assert.equal(content.reply_to,'second@example.com');
  assert.equal(content.to[0],'owner@example.com');
  assert.match(content.text,/Supertrend \+ DEMA Reversal Strategy/);
  return Response.json({id:'notice-id'});
 };
 response=await attempt({slug:'supertrend-dema-reversal',email:'second@example.com'},
  {...env,RESEND_API_KEY:'test-key',
   MANUAL_REQUEST_NOTIFY_TO:'owner@example.com',
   MANUAL_REQUEST_FROM:'orders@signaltoscript.com'});
 assert.equal(response.status,201,'notification configured request stored');
 const second=saved.get((await response.json()).requestId);
 assert.equal(second.notify_status,'sent');
 assert.equal(second.slug,'lifetime');
 console.log('Manual request tests passed: validation, honeypot, D1 persistence, location/timezones, rate limit and optional email.');
}finally{globalThis.fetch=originalFetch}
