import test from 'node:test';
import assert from 'node:assert/strict';
import {GOLD_PLANS,planOf,planDays,money} from '../functions/_lib/plans.js';
import {DAY} from '../functions/_lib/access.js';
import {onRequestPost as requestMembership} from '../functions/api/request.js';
import {onRequestPost as issueMembership} from '../functions/api/admin/issue.js';

const origin='https://gold.signaltoscript.com';
function dbStub({previousExpiry=0}={}){
 const statements=[],batches=[];
 const db={
  prepare(sql){
   const statement={
    sql,args:[],
    bind(...args){this.args=args;return this},
    async run(){statements.push({sql,args:this.args});return {meta:{changes:1}}},
    async all(){return {results:[{name:'plan'}]}},
    async first(){
     if(sql.includes('access_until_ms FROM memberships')&&previousExpiry)
      return {access_until_ms:previousExpiry};
     return null;
    }
   };
   return statement;
  },
  async batch(batch){batches.push(batch.map(statement=>({sql:statement.sql,args:statement.args})));return []}
 };
 return {db,statements,batches};
}
test('Black Friday prices and planned regular prices match the three offers',()=>{
 assert.deepEqual(Object.keys(GOLD_PLANS),['weekly','monthly','yearly']);
 for(const [id,days,price,regular] of [
  ['weekly',7,499,1249],['monthly',30,1499,3749],['yearly',365,8999,22499]
 ]){
  const p=planOf(id);
  assert.equal(p.days,days);
  assert.equal(p.priceCents,price);
  assert.equal(p.regularCents,regular);
  assert.ok((regular-price)/regular>=0.60);
 }
 assert.equal(money(499),'$4.99');
 assert.equal(planOf('lifetime'),null);
 assert.equal(planDays('monthly'),30);
});
test('Public membership request persists the selected weekly or annual plan',async()=>{
 for(const plan of ['weekly','monthly','yearly']){
  const {db,statements}=dbStub();
  const req=new Request(origin+'/api/request',{
   method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
   body:JSON.stringify({email:'buyer@example.com',plan,name:'Gold member'})
  });
  const response=await requestMembership({request:req,env:{DB:db}});
  assert.equal(response.status,201);
  const result=await response.json();
  assert.equal(result.plan,plan);
  const stored=statements.find(s=>s.sql.startsWith('INSERT INTO membership_requests'));
  assert.ok(stored);
  assert.equal(stored.args[4],plan);
 }
});
test('Invalid membership plan is rejected before storing requests',async()=>{
 const {db,statements}=dbStub();
 const req=new Request(origin+'/api/request',{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
  body:JSON.stringify({email:'buyer@example.com',plan:'unlimited'})
 });
 const response=await requestMembership({request:req,env:{DB:db}});
 assert.equal(response.status,400);
 assert.equal(statements.length,0);
});
test('Admin can issue a seven, thirty or 365-day paid membership',async()=>{
 for(const plan of ['weekly','monthly','yearly']){
  const {db,batches}=dbStub(),before=Date.now();
  const req=new Request(origin+'/api/admin/issue',{
   method:'POST',
   headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer test'},
   body:JSON.stringify({email:'buyer@example.com',plan,confirmPaid:true})
  });
  const response=await issueMembership({request:req,env:{DB:db,ADMIN_KEY:'test'}});
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.plan,plan);
  assert.equal(result.days,planDays(plan));
  assert.ok(result.expiresAt>=before+planDays(plan)*DAY);
  assert.ok(result.expiresAt<=Date.now()+planDays(plan)*DAY);
  assert.match(result.code,/^GOLD-(?:[A-F0-9]{4}-){7}[A-F0-9]{4}$/);
  assert.equal(batches.length,1);
  assert.ok(batches[0].some(s=>s.sql.startsWith('INSERT INTO memberships')));
 }
});
test('Early renewal extends from existing expiry, not from current date',async()=>{
 const previousExpiry=Date.now()+5*DAY;
 const {db}=dbStub({previousExpiry});
 const response=await issueMembership({request:new Request(origin+'/api/admin/issue',{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer test'},
  body:JSON.stringify({email:'buyer@example.com',plan:'weekly',confirmPaid:true})
 }),env:{DB:db,ADMIN_KEY:'test'}});
 assert.equal(response.status,200);
 assert.equal((await response.json()).expiresAt,previousExpiry+7*DAY);
});
