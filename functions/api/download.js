import {ensureAccessSchema,isMember,claimGuestDownload} from '../_lib/download-access.js';

const AVAILABLE = new Set(['supertrend-dema-reversal','1r-bear-breakout-achievements','goat-trap-pinbar-3ls-combo','supertrend-visual-bridge']);
export async function onRequestGet({ request, env }) {
  const slug = new URL(request.url).searchParams.get('script');
  if (!AVAILABLE.has(slug)) return new Response('Script not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const assetUrl = new URL(`/scripts/${slug}.pine`,request.url);
  const assetResponse = await env.ASSETS.fetch(new Request(assetUrl));
  if (!assetResponse.ok) return new Response('Script unavailable', { status: 404, headers: { 'Cache-Control': 'no-store' } });

  let guestCookie=null;
  if(env.DB) {
    try {
      await ensureAccessSchema(env.DB);
      if(!(await isMember(env.DB,request))) {
        const claimed=await claimGuestDownload(env.DB,request,slug);
        if(!claimed.allowed) {
          return Response.json({
            error:'Your one free guest download has been used. Join free to download more Pine Scripts.',
            code:'GUEST_LIMIT_REACHED'
          },{status:403,headers:{'Cache-Control':'no-store'}});
        }
        guestCookie=claimed.cookie;
      }
    } catch(error) {
      console.error('Free download access check failed',error);
      return new Response('Download service temporarily unavailable.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  }
  // The D1 aggregate counter is incremented only after access is approved.
  if (env.DB) {
    try {
      await env.DB.prepare(`INSERT INTO script_downloads (slug, downloads)
        VALUES (?, 1) ON CONFLICT(slug) DO UPDATE SET downloads = downloads + 1`
      ).bind(slug).run();
    } catch(error) { console.error('Could not record download',error); }
  }
  const response=new Response(assetResponse.body, {
    status:200,
    headers:{
      'Content-Type':'text/plain; charset=utf-8',
      'Content-Disposition':`attachment; filename="${slug}.pine"`,
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff'
    }
  });
  if(guestCookie) response.headers.append('Set-Cookie',guestCookie);
  return response;
}
