import {ensureAccessSchema,isMember,noStore} from '../_lib/download-access.js';

export async function onRequestGet({request,env}) {
  if(!env.DB)return Response.json({member:false,registrationAvailable:false,googleEnabled:true},{headers:noStore()});
  try{
    await ensureAccessSchema(env.DB);
    return Response.json({
      member:await isMember(env.DB,request),
      registrationAvailable:true,
      googleEnabled:true
    },{headers:noStore()});
  }catch(error){
    console.error('Could not check download access',error);
    return Response.json({error:'Sign-in service is temporarily unavailable.'},{status:503,headers:noStore()});
  }
}
