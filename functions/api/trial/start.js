// The previous complimentary Gold trial is retired in favor of Gold Signal Room.
export async function onRequestPost(){
 return Response.json({error:'Gold signals are now offered at Gold Signal Room.',
  code:'GOLD_ROOM_MOVED',url:'https://gold.signaltoscript.com/pricing.html'},
  {status:410,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
