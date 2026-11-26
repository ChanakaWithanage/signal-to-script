import {currentMember,ensureSchema,json} from '../_lib/access.js';
export async function onRequestGet({request,env}){
 if(!env.DB)return json({active:false,available:false});
 try{
  await ensureSchema(env.DB);
  const member=await currentMember(env.DB,request);
  return json({active:!!member,email:member?.email||null,expiresAt:member?.expiresAt||null,available:true});
 }catch(e){console.error('Gold membership session failed',e);return json({active:false,available:false},503)}
}
