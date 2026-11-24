import test from 'node:test';
import assert from 'node:assert/strict';
import {runGoldBreakout} from '../functions/_lib/gold-market.js';
import {validEmail,normalizeEmail,discordUrl,TRIAL_DAYS} from '../functions/_lib/gold-trial.js';
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
