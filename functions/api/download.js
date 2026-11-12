import {ensureAccessSchema,isMember} from '../_lib/download-access.js';

const AVAILABLE = new Set(['supertrend-dema-reversal','1r-bear-breakout-achievements','goat-trap-pinbar-3ls-combo','supertrend-visual-bridge']);
const HEADERS = {'Cache-Control':'no-store'};

export async function onRequestGet({request,env}) {
  const slug=new URL(request.url).searchParams.get('script');
  if(!AVAILABLE.has(slug))return new Response('Script not found',{status:404,headers:HEADERS});
  if(!env.DB)return Response.json({error:'Downloads are temporarily unavailable.'},{status:503,headers:HEADERS});
  try {
    await ensureAccessSchema(env.DB);
    if(!(await isMember(env.DB,request)))return Response.json({
      error:'Sign in with Google to download your free Pine Script.',
      code:'SIGN_IN_REQUIRED'
    },{status:401,headers:HEADERS});
  }catch(error){
    console.error('Download authentication failed',error);
    return Response.json({error:'Downloads are temporarily unavailable.'},{status:503,headers:HEADERS});
  }

  // When SCRIPT_BUCKET is configured, private R2 objects are the only source.
  // Otherwise retain the authenticated static-asset flow until R2 is populated.
  let fileBody;
  if(env.SCRIPT_BUCKET){
    try{
      const object=await env.SCRIPT_BUCKET.get(slug+'.pine');
      if(!object)return Response.json({error:'This script is temporarily unavailable.'},{status:503,headers:HEADERS});
      fileBody=object.body;
    }catch(error){
      console.error('Private script storage unavailable',error);
      return Response.json({error:'Downloads are temporarily unavailable.'},{status:503,headers:HEADERS});
    }
  }else{
    const assetUrl=new URL('/scripts/'+slug+'.pine',request.url);
    const assetResponse=await env.ASSETS.fetch(new Request(assetUrl));
    if(!assetResponse.ok)return new Response('Script unavailable',{status:404,headers:HEADERS});
    fileBody=assetResponse.body;
  }
  try{
    await env.DB.prepare('INSERT INTO script_downloads (slug, downloads) VALUES (?, 1) ON CONFLICT(slug) DO UPDATE SET downloads = downloads + 1').bind(slug).run();
  }catch(error){console.error('Could not record download',error)}
  return new Response(fileBody,{
    status:200,
    headers:{
      'Content-Type':'text/plain; charset=utf-8',
      'Content-Disposition':'attachment; filename="'+slug+'.pine"',
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff'
    }
  });
}
