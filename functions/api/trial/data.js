// The original free Gold workspace is retired. Live signal data is now only
// available through the standalone Gold Signal Room's membership-aware API.
export async function onRequestGet(){
 return Response.json({error:'Gold signals have moved to the dedicated Gold Signal Room.',
  code:'GOLD_ROOM_MOVED',url:'https://gold.signaltoscript.com/'},
  {status:410,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
   'Link':'<https://gold.signaltoscript.com/>; rel="canonical"'}});
}
