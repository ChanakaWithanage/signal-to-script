import {ensureAccessSchema,memberToken,hashToken,cookieHeader,correctOrigin,noStore} from '../_lib/download-access.js';
export async function onRequestPost({request,env}) {
  const headers=noStore();
  if (!correctOrigin(request)) return Response.json({error:'Invalid origin.'},{status:403,headers});
  try {
    if(env.DB) {
      await ensureAccessSchema(env.DB);
      const token=memberToken(request);
      if(token) await env.DB.prepare('DELETE FROM free_download_sessions WHERE token_hash = ?').bind(await hashToken(token)).run();
    }
    const response=Response.json({ok:true},{headers});
    response.headers.append('Set-Cookie',cookieHeader('member','',0));
    return response;
  } catch(error) {
    console.error('Sign-out failed',error);
    return Response.json({error:'Could not sign out. Please try again.'},{status:503,headers});
  }
}
