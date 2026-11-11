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

  const assetUrl=new URL(`/scripts/${slug}.pine`,request.url);
  const assetResponse=await env.ASSETS.fetch(new Request(assetUrl));
  if(!assetResponse.ok)return new Response('Script unavailable',{status:404,headers:HEADERS});
  try{
    await env.DB.prepare(`INSERT INTO script_downloads (slug, downloads)
      VALUES (?, 1) ON CONFLICT(slug) DO UPDATE SET downloads = downloads + 1`).bind(slug).run();
  }catch(error){console.error('Could not record download',error)}
  return new Response(assetResponse.body,{
    status:200,
    headers:{
      'Content-Type':'text/plain; charset=utf-8',
      'Content-Disposition':`attachment; filename="${slug}.pine"`,
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff'
    }
  });
}
