// First-party aggregate engagement counters: no IP or visitor identifiers are stored.
import {isPremium} from '../_lib/premium.js';

export async function onRequestPost({request,env}){
 const headers={'Cache-Control':'no-store'};
 if(!env.DB)return new Response(null,{status:204,headers});
 if(request.headers.get('Origin')!==new URL(request.url).origin)
  return Response.json({error:'Origin mismatch'},{status:403,headers});
 if(!(request.headers.get('Content-Type')||'').includes('application/json'))
  return new Response(null,{status:415,headers});
 const text=await request.text();
 if(text.length>400)return new Response(null,{status:413,headers});
 let payload;try{payload=JSON.parse(text)}catch{return new Response(null,{status:400,headers})}
 if(!isPremium(payload.slug)||!['article_click','article_view','buy_click'].includes(payload.event))
  return new Response(null,{status:400,headers});
 try{
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS premium_engagement (
   date_utc TEXT NOT NULL,
   slug TEXT NOT NULL,
   event TEXT NOT NULL,
   count INTEGER NOT NULL DEFAULT 0,
   PRIMARY KEY(date_utc,slug,event)
  )`).run();
  const date=new Date().toISOString().slice(0,10);
  await env.DB.prepare(
   'INSERT INTO premium_engagement(date_utc,slug,event,count) VALUES(?,?,?,1) ON CONFLICT(date_utc,slug,event) DO UPDATE SET count=count+1'
  ).bind(date,payload.slug,payload.event).run();
  return new Response(null,{status:204,headers});
 }catch(error){
  console.error('Engagement count failed',error);
  return new Response(null,{status:503,headers});
 }
}
