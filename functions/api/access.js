import {ensureAccessSchema,isMember,guestUsed,noStore} from '../_lib/download-access.js';

export async function onRequestGet({request,env}) {
  if (!env.DB) return Response.json(
    {member:false,guestUsed:false,registrationAvailable:false,guestLimit:1},
    {headers:noStore()}
  );
  try {
    await ensureAccessSchema(env.DB);
    const [member,spent]=await Promise.all([isMember(env.DB,request),guestUsed(env.DB,request)]);
    return Response.json(
      {member,guestUsed:spent,registrationAvailable:true,guestLimit:1},
      {headers:noStore()}
    );
  } catch(error) {
    console.error('Could not check free download access',error);
    return Response.json(
      {error:'Free download access is temporarily unavailable.'},
      {status:503,headers:noStore()}
    );
  }
}
