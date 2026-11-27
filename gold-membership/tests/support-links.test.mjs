import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {onRequest as admin} from '../functions/api/admin/support-links.js';
import {onRequest as support} from '../functions/support/[token].js';
import {SUPPORT_TTL_MS,ensureSupportSchema,issueSupportLink} from '../functions/_lib/support-links.js';
import {digest,currentMember} from '../functions/_lib/access.js';

const origin='https://gold.signaltoscript.com';
// Execute the production SQL against real SQLite, with D1's statement/batch interface.
function database(){
 const sqlite=new DatabaseSync(':memory:');
 const db={sqlite,prepare(sql){
  let args=[];
  return {bind(...values){args=values;return this},
   async run(){const info=sqlite.prepare(sql).run(...args);return {meta:{changes:info.changes}}},
   async first(){return sqlite.prepare(sql).get(...args)||null},
   async all(){return {results:sqlite.prepare(sql).all(...args)}}};
 },async batch(statements){
  sqlite.exec('BEGIN');
  try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results}
  catch(e){sqlite.exec('ROLLBACK');throw e}
 }};
 return db;
}
function api(env,body,{key='test-admin',requestOrigin=origin,method=body?'POST':'GET'}={}){
 const headers={};
 if(key!==null)headers.Authorization='Bearer '+key;
 if(requestOrigin!==null)headers.Origin=requestOrigin;
 if(body!==undefined)headers['Content-Type']='application/json';
 return admin({env,request:new Request(origin+'/api/admin/support-links',{method,headers,body:body===undefined?undefined:JSON.stringify(body)})});
}
function page(env,url,{accept,method='GET'}={}){
 return support({env,params:{token:new URL(url).pathname.split('/').pop()},request:new Request(url,{method,headers:accept?{Accept:accept}:{}})});
}
function privateResponse(response){
 assert.match(response.headers.get('Cache-Control'),/no-store/);
 assert.match(response.headers.get('X-Robots-Tag'),/noindex/);
 assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
 assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
}
test('every admin operation requires the existing key; mutations also require same origin',async()=>{
 const env={ADMIN_KEY:'test-admin',DB:{prepare(){throw Error('Must not touch D1')}}};
 for(const body of [undefined,{action:'generate'},{action:'revoke',id:'a'.repeat(32)},{action:'regenerate',id:'a'.repeat(32)}]){
  for(const key of [null,'wrong']){
   const response=await api(env,body,{key});assert.equal(response.status,401);privateResponse(response);
  }
  if(body)for(const requestOrigin of [null,'https://attacker.example'])assert.equal((await api(env,body,{requestOrigin})).status,401);
 }
 assert.equal((await api({DB:env.DB},{action:'generate'})).status,401);
 assert.equal((await api(env,undefined,{method:'DELETE'})).status,405);
});
test('generation stores only a hash, fixes lifetime to 30 minutes, and produces safe working links',async()=>{
 const DB=database(),env={DB,ADMIN_KEY:'test-admin'};
 try{
  const response=await api(env,{action:'generate',expiresAt:Date.now()+86400000,email:'ignored@example.com',url:'https://attacker.example'});
  assert.equal(response.status,201);privateResponse(response);
  const link=await response.json(),url=new URL(link.url),token=url.pathname.split('/').pop();
  assert.equal(url.origin,origin);assert.equal(url.search,'');assert.equal(url.hash,'');
  assert.match(url.pathname,/^\/support\/[a-f0-9]{64}$/);
  assert.equal(link.expiresAt-link.createdAt,SUPPORT_TTL_MS);
  const stored=DB.sqlite.prepare('SELECT * FROM membership_support_links').get();
  assert.equal(stored.token_hash,await digest(token));assert.ok(!JSON.stringify(stored).includes(token));
  assert.ok(!JSON.stringify(stored).includes('ignored@example.com'));
  const listing=await api(env),list=await listing.json();privateResponse(listing);
  assert.equal(list.links.length,1);assert.ok(!JSON.stringify(list).includes(token));assert.ok(!JSON.stringify(list).includes(stored.token_hash));
  const htmlResponse=await page(env,link.url);assert.equal(htmlResponse.status,200);privateResponse(htmlResponse);
  const html=await htmlResponse.text();
  assert.match(html,/<section id="support-details" hidden>/);
  assert.ok(html.includes('href="mailto:support@signaltoscript.com"'));
  const access=html.match(/href="(\/\?plan=monthly#pricing)"/)[1];
  assert.equal(new URL(access,origin).pathname,'/');
  const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(app,/openDialog\('request'\)/);
  assert.match(html,/To proceed with payment and membership access, please email us/);
  assert.match(html,/reply by email with payment instructions and send your access details once payment is confirmed/);
  assert.ok(!html.includes(token));assert.doesNotMatch(html,/google-analytics|gtag|cdn\./);
  const validJSON=await page(env,link.url,{accept:'application/json'});
  assert.equal((await validJSON.json()).expiresAt,link.expiresAt);
  const head=await page(env,link.url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  assert.equal(await currentMember(DB,new Request(link.url)),null);
 }finally{DB.sqlite.close()}
});
test('server expiry is exclusive at the exact boundary and has no public fallback',async()=>{
 const DB=database(),env={DB},realNow=Date.now,now=Date.UTC(2026,10,27,12);
 try{
  await ensureSupportSchema(DB);
  const link=await issueSupportLink(DB,origin,null,now);
  Date.now=()=>link.expiresAt-1;
  assert.equal((await page(env,link.url)).status,200);
  Date.now=()=>link.expiresAt;
  for(const options of [{},{accept:'application/json'},{method:'HEAD'}]){
   const response=await page(env,link.url,options);assert.equal(response.status,404);privateResponse(response);
   assert.doesNotMatch(await response.text(),/support@|mailto:|plan=monthly/);
  }
  Date.now=()=>link.expiresAt+1;
  assert.equal((await page(env,link.url)).status,404);
 }finally{Date.now=realNow;DB.sqlite.close()}
});
test('revoke is immediate and idempotent; regeneration revokes the old URL and only replaces once',async()=>{
 const DB=database(),env={DB,ADMIN_KEY:'test-admin'};
 try{
  const first=await (await api(env,{action:'generate'})).json();
  assert.equal((await api(env,{action:'revoke',id:first.id})).status,200);
  assert.equal((await api(env,{action:'revoke',id:first.id})).status,200);
  const revoked=await page(env,first.url);assert.equal(revoked.status,404);assert.doesNotMatch(await revoked.text(),/support@|mailto:/);
  const replacementResponse=await api(env,{action:'regenerate',id:first.id});
  assert.equal(replacementResponse.status,201);
  const second=await replacementResponse.json();assert.notEqual(second.url,first.url);
  assert.equal(second.expiresAt-second.createdAt,SUPPORT_TTL_MS);
  assert.equal((await page(env,second.url)).status,200);
  assert.equal((await api(env,{action:'regenerate',id:first.id})).status,409);
  const third=await (await api(env,{action:'regenerate',id:second.id})).json();
  assert.equal((await page(env,second.url,{accept:'application/json'})).status,404);
  assert.equal((await page(env,third.url)).status,200);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM membership_support_links WHERE revoked_ms IS NULL').get().n,1);
  assert.equal((await api(env,{action:'regenerate',id:'f'.repeat(32)})).status,409);
  assert.equal((await api(env,{action:'revoke',id:'f'.repeat(32)})).status,404);
 }finally{DB.sqlite.close()}
});
test('regeneration can replace expired links and failure rolls back without revoking the old link',async()=>{
 const DB=database(),env={DB,ADMIN_KEY:'test-admin'};
 try{
  await ensureSupportSchema(DB);
  const expired=await issueSupportLink(DB,origin,null,1);
  const response=await api(env,{action:'regenerate',id:expired.id});assert.equal(response.status,201);
  const next=await response.json();
  DB.sqlite.exec("CREATE TRIGGER fail_revoke BEFORE UPDATE ON membership_support_links BEGIN SELECT RAISE(ABORT,'test failure'); END");
  const failed=await api(env,{action:'regenerate',id:next.id});assert.equal(failed.status,503);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM membership_support_links').get().n,2);
  assert.equal((await page(env,next.url)).status,200);
 }finally{DB.sqlite.close()}
});
test('malformed, unknown, unsupported and failed requests fail closed without disclosing support details',async()=>{
 const DB=database(),env={DB,ADMIN_KEY:'test-admin'};
 try{
  for(const body of [{action:'delete'},{action:'revoke',id:'1'},{action:'regenerate',id:"' OR 1=1 --"}])assert.equal((await api(env,body)).status,400);
  const bad=await admin({env,request:new Request(origin+'/api/admin/support-links',{method:'POST',headers:{Origin:origin,Authorization:'Bearer test-admin','Content-Type':'application/json'},body:'{'})});
  assert.equal(bad.status,400);
  for(const token of ['invalid','a'.repeat(64),'A'.repeat(64)]){
   const response=await page(env,origin+'/support/'+token);assert.equal(response.status,404);privateResponse(response);
   assert.doesNotMatch(await response.text(),/support@|mailto:/);
  }
  assert.equal((await page(env,origin+'/support/'+ 'a'.repeat(64),{method:'POST'})).status,405);
  for(const brokenDB of [undefined,{prepare(){throw Error('sensitive error')}}]){
   const response=await page({DB:brokenDB},origin+'/support/'+ 'a'.repeat(64));
   assert.equal(response.status,503);privateResponse(response);assert.doesNotMatch(await response.text(),/sensitive|support@|mailto:/);
   assert.equal((await api({DB:brokenDB,ADMIN_KEY:'test-admin'},{action:'generate'})).status,503);
  }
 }finally{DB.sqlite.close()}
});

const browserSource=await readFile(new URL('../public/support.js',import.meta.url),'utf8');
function browser(){
 const listeners={},intervals=[],details={hidden:true},status={textContent:''};let clock=0,respond;
 const document={hidden:false,readyState:'complete',getElementById:id=>id==='support-details'?details:status,
  addEventListener:(name,fn)=>listeners[name]=fn};
 const context={document,location:{pathname:'/support/'+ 'a'.repeat(64)},performance:{now:()=>clock},
  addEventListener:(name,fn)=>listeners[name]=fn,setInterval:(fn,ms)=>intervals.push({fn,ms}),
  AbortSignal,fetch:async(path,options)=>{assert.equal(options.cache,'no-store');assert.equal(options.credentials,'omit');return respond(path,options)}};
 respond=async()=>Response.json({serverNow:1000,expiresAt:11000});
 runInNewContext(browserSource,context);
 return {details,status,document,listeners,intervals,setClock:n=>clock=n,setResponse:fn=>respond=fn};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('open customer page hides information at expiry and when revocation or network failure is detected',async()=>{
 for(const failure of [()=>new Response(null,{status:404}),()=>{throw Error('offline')}]){
  const b=browser();await flush();assert.equal(b.details.hidden,false);
  assert.match(b.status.textContent,/0:10/);
  b.setResponse(failure);await b.intervals.find(i=>i.ms===10000).fn();
  assert.equal(b.details.hidden,true);assert.match(b.status.textContent,/unavailable/);
 }
 const b=browser();await flush();b.setClock(10000);b.intervals.find(i=>i.ms===1000).fn();
 assert.equal(b.details.hidden,true);assert.match(b.status.textContent,/unavailable/);
});
test('customer page hides in background and revalidates before revealing after back navigation',async()=>{
 const b=browser();await flush();assert.equal(b.details.hidden,false);
 b.document.hidden=true;b.listeners.visibilitychange();assert.equal(b.details.hidden,true);
 b.setResponse(()=>new Response(null,{status:404}));
 b.document.hidden=false;b.listeners.pageshow();await flush();assert.equal(b.details.hidden,true);
});

test('admin controls generate and copy a URL, revoke it, and regenerate a usable replacement',async()=>{
 const DB=database(),env={DB,ADMIN_KEY:'test-admin'},elements=new Map();let copied='';
 class Element{
  constructor(tag='div'){this.tag=tag;this.children=[];this.listeners={};this.value='';this.hidden=false;this.textContent=''}
  append(...children){this.children.push(...children)}
  replaceChildren(...children){this.children=children}
  addEventListener(event,fn){this.listeners[event]=fn}
  querySelectorAll(tag){return this.children.flatMap(child=>[...(child.tag===tag?[child]:[]),...child.querySelectorAll(tag)])}
 }
 const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
 const intervals=[];
 try{
  const source=await readFile(new URL('../public/admin.js',import.meta.url),'utf8');
  runInNewContext(source,{
   document:{getElementById:get,createElement:tag=>new Element(tag)},
   navigator:{clipboard:{writeText:async text=>{copied=text}}},
   setInterval:fn=>intervals.push(fn),
   fetch:async(path,options)=>{
    assert.equal(options.cache,'no-store');
    assert.equal(options.headers.Authorization,'Bearer test-admin');
    if(path==='/api/admin/requests')return Response.json({requests:[],members:[]});
    assert.equal(path,'/api/admin/support-links');
    return admin({env,request:new Request(origin+path,{...options,headers:{...options.headers,Origin:origin}})});
   }
  });
  get('admin-key').value='test-admin';
  await get('admin-auth').listeners.submit({preventDefault(){}});
  assert.equal(get('admin-key').value,'');assert.equal(get('admin-content').hidden,false);
  await get('generate-support-link').listeners.click();
  const first=get('support-url').value;assert.match(first,/\/support\/[a-f0-9]{64}$/);
  assert.equal(get('generated-support-link').hidden,false);
  await get('copy-support-link').listeners.click();assert.equal(copied,first);
  assert.equal((await page(env,first)).status,200);
  const button=name=>get('support-link-rows').querySelectorAll('button').find(el=>el.textContent===name);
  await button('Revoke').listeners.click();
  assert.equal(get('support-url').value,'');assert.equal(get('generated-support-link').hidden,true);
  assert.equal((await page(env,first)).status,404);
  await button('Regenerate').listeners.click();
  const second=get('support-url').value;assert.notEqual(second,first);
  assert.equal((await page(env,second)).status,200);
  assert.equal((await page(env,first)).status,404);
  await get('copy-support-link').listeners.click();assert.equal(copied,second);
 }finally{DB.sqlite.close()}
});
