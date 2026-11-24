import {ensureTrialSchema,signedIn,respond} from '../../_lib/gold-trial.js';
import {fetchGoldCandles,runGoldBreakout} from '../../_lib/gold-market.js';
export async function onRequestGet({request,env}){
 if(!env.DB)return respond({error:'Trial data is temporarily unavailable.'},503);
 try{
  await ensureTrialSchema(env.DB);
  const member=await signedIn(env.DB,request);
  if(!member)return respond({error:'Enter your email to unlock the Gold Breakout trial.',code:'SIGN_IN_REQUIRED'},401);
  if(!member.active)return respond({error:'Your seven-day trial has finished.',code:'TRIAL_ENDED',expiresAt:member.expiresAt},403);
  const days=new URL(request.url).searchParams.get('days')==='60'?60:30;
  if(days>30&&!member.lifetime)return respond({error:'The 60-day backtest is included with lifetime membership.',code:'UPGRADE_REQUIRED'},403);
  const feed=await fetchGoldCandles(days);
  const model=runGoldBreakout(feed.bars,{days});
  return respond({...model,market:{source:feed.source,symbol:feed.symbol,
   lastClosedBar:feed.asOf,interval:feed.interval},trial:{lifetime:member.lifetime,expiresAt:member.expiresAt}});
 }catch(e){console.error('Trial market data error',e);return respond({error:'Gold candles are refreshing. Please try again in a moment.'},503)}
}
