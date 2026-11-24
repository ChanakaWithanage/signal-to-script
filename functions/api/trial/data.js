import {ensureTrialSchema,signedIn,respond} from '../../_lib/gold-trial.js';
import {fetchGoldCandles,runGoldBreakout} from '../../_lib/gold-market.js';
import {illustrativeGoldResults,goldTradeUsd} from '../../_lib/gold-performance.js';

// Visitors can inspect real past signals and up to 30 days of backtest results
// before subscribing. Email is used only for future alerts and trial tracking.
// 60-day historical testing remains exclusive to lifetime members.
export async function onRequestGet({request,env,waitUntil}){
 try{
  let member=null;
  if(env.DB){
   try{
    await ensureTrialSchema(env.DB);
    member=await signedIn(env.DB,request);
   }catch(error){
    // Public chart and historical results do not require subscriber DB availability.
    console.error('Gold session unavailable while loading public market data',error);
   }
  }
  const requestedDays=new URL(request.url).searchParams.get('days')==='60'?60:30;
  if(requestedDays>30&&!member?.lifetime){
   return respond({error:'Extended historical testing is part of lifetime access.',code:'UPGRADE_REQUIRED'},403);
  }
  const feed=await fetchGoldCandles(requestedDays,{
   db:env.DB||null,waitUntil:typeof waitUntil==='function'?waitUntil:null
  });
  const model=runGoldBreakout(feed.bars,{days:requestedDays});
  const performanceUsd=illustrativeGoldResults(model.stats);
  const trades=model.trades.map(trade=>({
   ...trade,resultUsd:goldTradeUsd(trade.r,performanceUsd?.riskUsd)
  }));
  return respond({...model,trades,performanceUsd,preview:false,previewDays:null,
   market:{source:feed.source,symbol:feed.symbol,lastClosedBar:feed.asOf,
    interval:feed.interval,availableDays:feed.availableDays,
    limitedHistory:feed.limitedHistory,stale:!!feed.stale},
   trial:{signedIn:!!member,active:!!member?.active,lifetime:!!member?.lifetime,
    expiresAt:member?.expiresAt||null}});
 }catch(error){
  console.error('Gold trial data error',error);
  return respond({error:'Gold candles are refreshing. Please try again in a moment.'},503);
 }
}
