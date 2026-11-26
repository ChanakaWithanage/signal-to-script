import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GOLD_PLANS,money} from '../functions/_lib/plans.js';

test('Pricing is shown on both dashboard and dedicated page, with valid plan links',async()=>{
 const index=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const pricing=await readFile(new URL('../public/pricing.html',import.meta.url),'utf8');
 const css=await readFile(new URL('../public/pricing.css',import.meta.url),'utf8');
 for(const [id,plan] of Object.entries(GOLD_PLANS)){
  for(const html of [index,pricing]){
   assert.match(html,/BLACK FRIDAY/);
   assert.match(html,/60% OFF/);
   assert.ok(html.includes(money(plan.priceCents)),id+' sale price missing');
   assert.ok(html.includes(money(plan.regularCents)),id+' crossed-out reference price missing');
  }
  assert.ok(index.includes('data-plan="'+id+'"'),id+' homepage choice missing');
  assert.ok(pricing.includes('/?plan='+id+'#pricing'),id+' deep link missing');
  assert.ok(index.includes('name="plan" value="'+id+'"'),id+' request radio missing');
 }
 assert.match(css,/grid-template-columns:1fr/);
 assert.match(index,/<del>\$12\.49<\/del>/);
});
test('Membership administration offers all durations and script sends plan to server',async()=>{
 const html=await readFile(new URL('../public/admin.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../public/admin.js',import.meta.url),'utf8');
 const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 for(const id of Object.keys(GOLD_PLANS)){
  assert.ok(html.includes('<option value="'+id+'"'),id);
  assert.ok(app.includes(id+':{name:'),id+' missing in popup');
 }
 assert.match(js,/confirmPaid:true/);
 assert.match(js,/email,plan,requestId/);
 assert.match(app,/plan:document\.querySelector/);
});
