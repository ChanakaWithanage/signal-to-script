// Protect direct /scripts/*.pine requests, not just the download API.
// This middleware runs before Pages serves the static Pine Script assets.
import {ensureAccessSchema,isMember} from '../_lib/download-access.js';

const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function onRequest({request,env,next}){
  const path=new URL(request.url).pathname;
  if(!/^\/scripts\/[a-z0-9-]+\.pine$/.test(path)){
    return new Response('Not found',{status:404,headers});
  }
  if(!env.DB)return new Response('Downloads are temporarily unavailable.',{status:503,headers});
  try{
    await ensureAccessSchema(env.DB);
    if(!(await isMember(env.DB,request))){
      return Response.json({
        error:'Sign in with Google to download this free script.',
        code:'SIGN_IN_REQUIRED'
      },{status:401,headers});
    }
  }catch(error){
    console.error('Direct script access check failed',error);
    return new Response('Downloads are temporarily unavailable.',{status:503,headers});
  }
  // When private R2 is enabled, never serve a fallback static asset.
  if(env.SCRIPT_BUCKET)return new Response('Use the website download button.',{status:404,headers});
  const response=await next();
  const resultHeaders=new Headers(response.headers);
  resultHeaders.set('Cache-Control','no-store');
  resultHeaders.set('X-Content-Type-Options','nosniff');
  return new Response(response.body,{
    status:response.status,
    statusText:response.statusText,
    headers:resultHeaders
  });
}
