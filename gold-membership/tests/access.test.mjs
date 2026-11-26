import test from 'node:test';
import assert from 'node:assert/strict';
import {releasedBars,DELAY_MS,BAR_MS,TERM_MS,generatedCode,normalizedCode,emailOf,validEmail,adminAllowed} from '../functions/_lib/access.js';

test('public receives only candles at least 30 minutes past confirmed close',()=>{
 const now=Date.UTC(2026,10,26,12,0,0);
 const bars=[{time:now-60*60000},{time:now-45*60000},{time:now-44*60000},
  {time:now-30*60000},{time:now-15*60000}];
 assert.equal(BAR_MS,15*60000);assert.equal(DELAY_MS,30*60000);
 assert.deepEqual(releasedBars(bars,false,now),bars.slice(0,2));
 assert.deepEqual(releasedBars(bars,true,now),bars);
});
test('membership term is exactly thirty 24-hour days',()=>assert.equal(TERM_MS,30*86400000));
test('generated codes are strong, parseable, and not reused by accident',()=>{
 const codes=new Set(Array.from({length:100},generatedCode));
 assert.equal(codes.size,100);
 for(const code of codes){
  assert.match(code,/^GOLD-(?:[A-F0-9]{4}-){7}[A-F0-9]{4}$/);
  assert.match(normalizedCode(code),/^GOLD[A-F0-9]{32}$/);
 }
 assert.equal(normalizedCode('BAD-CODE'),null);
});
test('email normalization and validation rejects malformed email',()=>{
 assert.equal(emailOf(' ADMIN@Example.com '),'admin@example.com');
 assert.equal(validEmail(emailOf(' ADMIN@Example.com ')),true);
 assert.equal(validEmail('not an email'),false);
});

test('admin access accepts the configured short secret without a length requirement',async()=>{
 const request=key=>new Request('https://gold.signaltoscript.com/api/admin/requests',{
  headers:{Authorization:'Bearer '+key}
 });
 assert.equal(await adminAllowed(request('demo'),{ADMIN_KEY:'demo'}),true);
 assert.equal(await adminAllowed(request('a'),{ADMIN_KEY:'a'}),true);
 assert.equal(await adminAllowed(request('wrong'),{ADMIN_KEY:'demo'}),false);
 assert.equal(await adminAllowed(request('demo'),{ADMIN_KEY:''}),false);
});
