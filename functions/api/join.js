import {ensureAccessSchema,isMember,randomToken,hashToken,cookieHeader,ACCESS_AGE,correctOrigin,noStore} from '../_lib/download-access.js';

export async function onRequestPost({request,env}) {
  const headers=noStore();
  if (!correctOrigin(request)) return Response.json({error:'Invalid origin.'},{status:403,headers});
  if (!env.DB) return Response.json(
    {error:'Signup is not enabled yet. A Cloudflare D1 database binding named DB is required.'},
    {status:503,headers}
  );
  const raw=await request.text();
  if (raw.length > 1500) return Response.json({error:'Request is too large.'},{status:413,headers});
  let data;
  try { data=JSON.parse(raw); }
  catch {return Response.json({error:'Invalid form data.'},{status:400,headers});}
  if (data.website) return Response.json({error:'Unable to process this signup.'},{status:400,headers});
  const email=typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  if(email.length<6 || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({error:'Enter a valid email address.'},{status:400,headers});
  }
  if(data.accepted !== true) return Response.json(
    {error:'Please accept the privacy notice to continue.'},{status:400,headers}
  );
  try {
    await ensureAccessSchema(env.DB);
    const id=crypto.randomUUID();
    await env.DB.prepare('INSERT OR IGNORE INTO free_download_members (id,email) VALUES (?,?)').bind(id,email).run();
    const member=await env.DB.prepare('SELECT id FROM free_download_members WHERE email = ? LIMIT 1').bind(email).first();
    if(!member?.id) throw new Error('Could not establish free membership');
    const token=randomToken();
    const expiresAt=new Date(Date.now()+ACCESS_AGE.member*1000).toISOString();
    await env.DB.prepare(
      'INSERT INTO free_download_sessions(token_hash,member_id,expires_at) VALUES (?,?,?)'
    ).bind(await hashToken(token),member.id,expiresAt).run();
    const reply=Response.json({
      ok:true,member:true,
      note:'Free access is active in this browser for 30 days. Email addresses are not verified in this version.'
    },{headers});
    reply.headers.append('Set-Cookie',cookieHeader('member',token,ACCESS_AGE.member));
    return reply;
  } catch(error) {
    console.error('Signup failed',error);
    return Response.json({error:'Signup could not be completed. Please try again.'},{status:503,headers});
  }
}
