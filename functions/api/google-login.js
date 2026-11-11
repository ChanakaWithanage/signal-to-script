import {ensureAccessSchema,randomToken,hashToken,cookieHeader,ACCESS_AGE,correctOrigin,noStore} from '../_lib/download-access.js';
import {verifyGoogleCredential} from '../_lib/google-verify.mjs';
const GOOGLE_CLIENT_ID='121639481880-4lrf81h9me5o35tdv3p9jjb4gmr9983b.apps.googleusercontent.com';
export async function onRequestPost({request,env}){
 const headers=noStore();
 if(!correctOrigin(request))return Response.json({error:'Invalid request origin.'},{status:403,headers});
 if(!env.DB)return Response.json({error:'Google sign-in is currently unavailable. Please try again later.'},{status:503,headers});
 const type=request.headers.get('content-type')||'';
 if(!type.includes('application/json'))return Response.json({error:'Invalid sign-in request.'},{status:415,headers});
 const body=await request.text();
 if(body.length>15000)return Response.json({error:'Request too large.'},{status:413,headers});
 let token;
 try{token=JSON.parse(body).credential}catch{return Response.json({error:'Invalid sign-in request.'},{status:400,headers})}
 let googleUser;
 try{googleUser=await verifyGoogleCredential(token,GOOGLE_CLIENT_ID)}
 catch(error){console.error('Google identity verification failed',error.message);return Response.json({error:'Could not verify your Google sign-in. Please try again.'},{status:401,headers})}
 try{
  await ensureAccessSchema(env.DB);
  await env.DB.prepare(`INSERT INTO free_google_members (google_sub,email) VALUES (?,?)
   ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email,last_login_at=CURRENT_TIMESTAMP`).bind(googleUser.sub,googleUser.email).run();
  const session=randomToken();
  await env.DB.prepare('INSERT INTO free_google_sessions(token_hash,google_sub,expires_at) VALUES (?,?,?)')
   .bind(await hashToken(session),googleUser.sub,new Date(Date.now()+ACCESS_AGE.member*1000).toISOString()).run();
  const response=Response.json({ok:true,member:true},{headers});
  response.headers.append('Set-Cookie',cookieHeader('member',session,ACCESS_AGE.member));
  return response;
 }catch(error){console.error('Google sign-in failed',error);return Response.json({error:'Unable to finish sign-in. Please try again.'},{status:503,headers})}
}
