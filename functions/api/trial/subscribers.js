import {ensureTrialSchema,respond} from '../../_lib/gold-trial.js';

// Owner-only subscriber totals and email lead list.
// Configure TRIAL_ADMIN_KEY in Cloudflare Pages secrets; do not embed in site JS.
export async function onRequestGet({request,env}){
 const secret=env.TRIAL_ADMIN_KEY;
 const auth=request.headers.get('Authorization')||'';
 if(!secret||secret.length<32||auth!=='Bearer '+secret)
  return respond({error:'Not found.'},404);
 if(!env.DB)return respond({error:'Subscriber database is not configured.'},503);
 try{
  await ensureTrialSchema(env.DB);
  const since=Date.now()-7*86400000;
  const summary=await env.DB.prepare(`SELECT COUNT(*) AS subscribers,
   COALESCE(SUM(signup_count),0) AS signup_events,
   SUM(CASE WHEN first_signup_ms>=? THEN 1 ELSE 0 END) AS new_last_7_days
   FROM gold_trial_subscribers`).bind(since).first();
  const accounts=await env.DB.prepare(`SELECT
   SUM(CASE WHEN lifetime=0 AND expires_ms>? THEN 1 ELSE 0 END) AS active_trials,
   SUM(CASE WHEN lifetime=0 AND expires_ms<=? THEN 1 ELSE 0 END) AS completed_trials,
   SUM(CASE WHEN lifetime=1 THEN 1 ELSE 0 END) AS lifetime_members
   FROM gold_trial_accounts`).bind(Date.now(),Date.now()).first();
  const recent=await env.DB.prepare(`SELECT email,first_signup_ms,last_signup_ms,
   signup_count,source,country,region,city,timezone,referrer,utm_source,
   utm_medium,utm_campaign FROM gold_trial_subscribers
   ORDER BY last_signup_ms DESC LIMIT 100`).all();
  return respond({totals:{...summary,...accounts},subscribers:recent.results||[]});
 }catch(error){
  console.error('Subscriber overview failed',error);
  return respond({error:'Unable to load subscriber overview.'},503);
 }
}
