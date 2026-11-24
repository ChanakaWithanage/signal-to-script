import {ensureTrialSchema,signedIn,respond} from '../../_lib/gold-trial.js';
import {fetchGoldCandles,runGoldBreakout} from '../../_lib/gold-market.js';

const PREVIEW_DAYS=5;
const DAY_MS=86400000;

// Visitors can inspect the real Gold workspace immediately. Email verification
// activates alerts and 30-day history; an expired trial returns to preview mode.
export async function onRequestGet({request,env}){
 try{
  let member=null;
  if(env.DB){
   await ensureTrialSchema(env.DB);
   member=await signedIn(env.DB,request);
  }
  const requestedDays=new URL(request.url).searchParams.get('days')==='60'?60:30;
  if(requestedDays>30&&!member?.lifetime){
   return respond({error:'Extended historical testing is part of lifetime access.',code:'UPGRADE_REQUIRED'},403);
  }
  const fullAccess=Boolean(member?.active);
  const feed=await fetchGoldCandles(fullAccess?requestedDays:30);
  const model=runGoldBreakout(feed.bars,{days:fullAccess?requestedDays:30});
  if(!fullAccess){
   const newest=model.candles.at(-1)?.time||Date.now();
   const since=newest-PREVIEW_DAYS*DAY_MS;
   model.candles=model.candles.filter(c=>c.time>=since);
   model.events=model.events.filter(e=>e.time>=since);
   model.ranges=model.ranges.filter(r=>r.end>=since);
   model.trades=[];
   model.stats=null;
   model.current.lastEvent=model.events.at(-1)||null;
  }
  return respond({...model,preview:!fullAccess,
   previewDays:fullAccess?null:PREVIEW_DAYS,
   market:{source:feed.source,symbol:feed.symbol,lastClosedBar:feed.asOf,interval:feed.interval},
   trial:{signedIn:!!member,active:fullAccess,lifetime:!!member?.lifetime,expiresAt:member?.expiresAt||null}});
 }catch(error){
  console.error('Gold trial data error',error);
  return respond({error:'Gold candles are refreshing. Please try again in a moment.'},503);
 }
}
