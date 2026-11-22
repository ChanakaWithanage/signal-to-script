export const FREE_SCRIPTS=Object.freeze({
  '1r-bear-breakout-achievements':'1R Bear Breakout Achievements',
  'goat-trap-pinbar-3ls-combo':'Goat Trap Pinbar + 3LS',
  'supertrend-visual-bridge':'Supertrend Visual Bridge',
  'no-wick-ema-retest-strategy':'No-Wick EMA Retest Strategy'
});

export async function freeScriptFile(env,request,slug){
  if(!Object.hasOwn(FREE_SCRIPTS,slug))return null;
  if(env.SCRIPT_BUCKET)return env.SCRIPT_BUCKET.get(slug+'.pine');
  const response=await env.ASSETS.fetch(new Request(new URL('/scripts/'+slug+'.pine',request.url)));
  return response.ok?response:null;
}
