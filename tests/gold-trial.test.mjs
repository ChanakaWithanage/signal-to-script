import test from 'node:test';
import assert from 'node:assert/strict';
import {runGoldBreakout} from '../functions/_lib/gold-market.js';
import {validEmail,normalizeEmail,discordUrl,TRIAL_DAYS,UPGRADE_AFTER_MS,upgradeEligible,claimUpgradePrompt} from '../functions/_lib/gold-trial.js';
function dayBars(date,side='LONG',ambiguous=false){
 const start=Date.parse(date+'T21:00:00Z');
 const bars=[];
 for(let index=0;index<96;index++){
  let open=105,high=110,low=100,close=105;
  if(index>=28&&index<80){open=105;high=109;low=102;close=106}
  if(index===28){
   if(ambiguous){open=105;high=112;low=98;close=107}
   else if(side==='LONG'){open=109.4;high=112;low=109.3;close=111}
   else{open=100.6;high=101;low=98;close=99}
  }
  if(index>28&&index<80){
   if(side==='LONG'){open=112;high=115;low=111;close=114}
   else{open=97;high=99;low=94;close=95}
  }
  if(index>=80){open=side==='LONG'?115:94;high=open+1;low=open-1;close=open}
  bars.push({time:start+index*900000,open,high,low,close});
 }
 return bars;
}
test('Gold 15M runs one complete breakout and time exit from a complete overnight range',()=>{
 const result=runGoldBreakout(dayBars('2026-11-18'),{days:30});
 assert.equal(result.stats.trades,1);
 assert.equal(result.stats.wins,1);
 assert.equal(result.trades[0].side,'LONG');
 assert.equal(result.trades[0].reason,'Session close');
 assert.equal(result.events[0].type,'ENTRY');
 assert.equal(result.events.at(-1).type,'EXIT');
 assert.equal(result.ranges.length,1);
 assert.equal(result.ranges[0].high,110);
});
test('A short breakout has a negative-direction entry signal and a closed trade',()=>{
 const result=runGoldBreakout(dayBars('2026-11-18','SHORT'),{days:30});
 assert.equal(result.trades.length,1);
 assert.equal(result.trades[0].side,'SHORT');
 assert.equal(result.events[0].side,'SHORT');
});
test('Ambiguous same-bar breaks do not fabricate entry order',()=>{
 const result=runGoldBreakout(dayBars('2026-11-18','LONG',true),{days:30});
 assert.equal(result.trades.length,0);
 assert.equal(result.events.length,0);
});
test('Trial email normalization, Discord hook checks and duration',()=>{
 assert.equal(TRIAL_DAYS,7);
 assert.equal(normalizeEmail('  TEST@EXAMPLE.COM  '),'test@example.com');
 assert.equal(validEmail('test@example.com'),true);
 assert.equal(validEmail('not-email'),false);
 assert.equal(discordUrl('https://discord.com/api/webhooks/123456789012345678/abcdefghijABCDEFGHIJ'),true);
 assert.equal(discordUrl('https://other.example/api/webhooks/123456789012345678/abcdefghijABCDEFGHIJ'),false);
});

test('Lifetime offer starts after day five, not during the initial signup',()=>{
 const started=Date.parse('2026-11-01T00:00:00Z');
 const account={email:'gold@example.com',createdAt:started,expiresAt:started+7*86400000,lifetime:false};
 assert.equal(UPGRADE_AFTER_MS,5*86400000);
 assert.equal(upgradeEligible(account,started),false);
 assert.equal(upgradeEligible(account,started+4*86400000+86399999),false);
 assert.equal(upgradeEligible(account,started+5*86400000),true);
 assert.equal(upgradeEligible(account,started+7*86400000),true);
 assert.equal(upgradeEligible({...account,lifetime:true},started+6*86400000),false);
});
test('Membership prompt is limited to once per account every 24 hours',async()=>{
 const first=Date.parse('2026-11-07T00:00:00Z');
 const account={email:'gold2@example.com',createdAt:first-6*86400000,lifetime:false};
 const last=new Map();
 const db={prepare(sql){
  let args=[];
  return {bind(...values){args=values;return this},async run(){
   if(!sql.includes('INSERT INTO gold_trial_offer_prompts'))return {meta:{changes:0}};
   const [email,now,limit]=args;
   if(last.has(email)&&last.get(email)>limit)return {meta:{changes:0}};
   last.set(email,now);return {meta:{changes:1}};
  }};
 }};
 assert.equal(await claimUpgradePrompt(db,account,first),true);
 assert.equal(await claimUpgradePrompt(db,account,first+1000),false);
 assert.equal(await claimUpgradePrompt(db,account,first+24*3600000),true);
 assert.equal(await claimUpgradePrompt(db,{...account,lifetime:true},first+48*3600000),false);
});
test('Gold alert marketing opens the workspace before collecting email',async()=>{
 const {readFile}=await import('node:fs/promises');
 const home=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const page=await readFile(new URL('../public/trial.html',import.meta.url),'utf8');
 const article=await readFile(new URL('../public/articles/gold-breakout-15m-strategy.html',import.meta.url),'utf8');
 assert.match(home,/Get Gold Breakout alerts for free/);
 assert.doesNotMatch(home,/Try it before you buy|7 days free|Email only/i);
 assert.match(page,/<section class="trial-workspace" id="trial-workspace">/);
 assert.match(page,/<dialog class="trial-access-dialog"/);
 assert.match(page,/Enter your email and start for free/);
 assert.match(page,/<dialog class="trial-upgrade-dialog"/);
 assert.doesNotMatch(article,/\$4\.99|before buying/);
});
