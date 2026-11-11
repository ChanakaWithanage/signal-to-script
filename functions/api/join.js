// Legacy unverified email registration is disabled. Use Google sign-in instead.
export async function onRequestPost(){
 return Response.json({error:'Use Google sign-in to get free downloads.'},{status:410,headers:{'Cache-Control':'no-store'}});
}
