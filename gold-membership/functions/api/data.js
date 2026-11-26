import {currentMember,ensureSchema,releasedBars,json,DELAY_MS,BAR_MS} from '../_lib/access.js';
import {fetchGoldCandles,runGoldBreakout} from '../_lib/gold-market.js';
import {illustrativeGoldResults,goldTradeUsd} from '../_lib/gold-performance.js';
export async function onRequestGet({request,env,waitUntil}){
 try{
  let member=null;
  if(env.DB){
   try{await ensureSchema(env.DB);member=await currentMember(env.DB,request)}
   catch(error){console.error('Membership verification failed, using delayed view',error)}
  }
  const requestedDays=new URL(request.url).searchParams.get('days')==='60'?60:30;
  if(requestedDays===60&&!member)return json({error:'60-day history is available to members.',code:'MEMBERS_ONLY'},403);
  const feed=await fetchGoldCandles(requestedDays,{
   db:env.DB||null,waitUntil:typeof waitUntil==='function'?waitUntil:null
  });
  const bars=releasedBars(feed.bars,!!member);
  if(bars.length<56)return json({error:'Gold market history is temporarily unavailable.'},503);
  const model=runGoldBreakout(bars,{days:requestedDays});
  const performanceUsd=illustrativeGoldResults(model.stats);
  return json({
   ...model,
   trades:model.trades.map(t=>({...t,resultUsd:goldTradeUsd(t.r,performanceUsd?.riskUsd)})),
   performanceUsd,
   access:{tier:member?'member':'public',delayMinutes:member?0:DELAY_MS/60000,expiresAt:member?.expiresAt||null},
   market:{source:feed.source,symbol:feed.symbol,interval:'15m',
    lastClosedBar:new Date(bars.at(-1).time+BAR_MS).toISOString(),
    availableDays:(bars.at(-1).time-bars[0].time+BAR_MS)/86400000,
    stale:!!feed.stale}
  });
 }catch(error){console.error('Gold membership data unavailable',error);return json({error:'Market data is refreshing. Please retry shortly.'},503)}
}
