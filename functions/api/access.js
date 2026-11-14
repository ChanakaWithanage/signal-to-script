import {ensureAccessSchema,isMember,guestUsed,noStore} from '../_lib/download-access.js';

export async function onRequestGet({request,env}){
 if(!env.DB)return Response.json({member:false,guestUsed:false,guestLimit:1,registrationAvailable:false,googleEnabled:true},{headers:noStore()});
 try{
  await ensureAccessSchema(env.DB);
  const [member,spent]=await Promise.all([isMember(env.DB,request),guestUsed(env.DB,request)]);
  return Response.json({member,guestUsed:spent,guestLimit:1,registrationAvailable:true,googleEnabled:true},{headers:noStore()});
 }catch(error){
  console.error('Could not check free access',error);
  return Response.json({error:'Download access is temporarily unavailable.'},{status:503,headers:noStore()});
 }
}
