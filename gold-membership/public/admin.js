'use strict';
const $=id=>document.getElementById(id);
let adminKey='',rows=[];
const utc=ms=>new Date(ms).toLocaleString('en-GB',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})+' UTC';
async function call(path,method='GET',data){
 const options={method,credentials:'same-origin',cache:'no-store',headers:{Authorization:'Bearer '+adminKey}};
 if(data){options.headers['Content-Type']='application/json';options.body=JSON.stringify(data)}
 const response=await fetch('/api/admin/'+path,options);
 let result={};try{result=await response.json()}catch{}
 if(!response.ok)throw Error(result.error||'Request failed');
 return result;
}
const feedback=t=>$('admin-feedback').textContent=t;
const cell=(text,cls)=>{const el=document.createElement('td');el.textContent=text;if(cls)el.className=cls;return el};
function action(tr,name,onClick){const b=document.createElement('button');b.type='button';b.className='btn ghost';b.textContent=name;b.addEventListener('click',onClick);tr.append(b)}
function render(data){
 rows=data.requests||[];$('admin-content').hidden=false;
 $('admin-new').textContent=rows.filter(r=>r.status==='new').length;
 $('admin-contacted').textContent=rows.filter(r=>r.status==='contacted').length;
 $('admin-active').textContent=(data.members||[]).filter(m=>m.access_until_ms>Date.now()).length;
 const body=$('admin-rows');body.replaceChildren();
 if(!rows.length){const tr=document.createElement('tr'),td=cell('No membership requests yet.');td.colSpan=5;tr.append(td);body.append(tr);return}
 for(const r of rows){
  const tr=document.createElement('tr');
  tr.append(cell(r.id+'\n'+utc(r.created_ms)),cell(r.email+(r.name?'\n'+r.name:''),'row-email'),cell((r.note||'—')+'\n'+(r.plan||'monthly').toUpperCase()+' PLAN','row-note'),cell(r.status,'row-status'));
  const actions=document.createElement('td');
  if(r.status==='new')action(actions,'Mark contacted',()=>changeStatus(r,'contacted'));
  if(r.status!=='paid'&&r.status!=='closed'){
   action(actions,'Mark paid & issue',()=>{$('issue-email').value=r.email;$('issue-ref').value=r.id;$('issue-plan').value=['weekly','monthly','yearly'].includes(r.plan)?r.plan:'monthly';$('issue-paid').checked=false;document.getElementById('issue-form').scrollIntoView({behavior:'smooth',block:'center'});});
   action(actions,'Close',()=>changeStatus(r,'closed'));
  }
  if(r.status==='closed')action(actions,'Reopen',()=>changeStatus(r,'new'));
  tr.append(actions);body.append(tr);
 }
}
async function reload(){
 try{render(await call('requests'));feedback('Requests loaded.');await reloadSupportLinks()}catch(e){$('admin-content').hidden=true;clearSupportURL();feedback(e.message)}
}
async function changeStatus(item,status){
 if(status==='closed'&&!confirm('Close request '+item.id+'?'))return;
 try{await call('status','POST',{id:item.id,status});await reload()}catch(e){feedback(e.message)}
}
$('admin-auth').addEventListener('submit',async ev=>{
 ev.preventDefault();adminKey=$('admin-key').value.trim();
 $('admin-key').value='';await reload();
});
$('reload-requests').addEventListener('click',reload);
$('issue-form').addEventListener('submit',async ev=>{
 ev.preventDefault();
 if(!$('issue-paid').checked){feedback('Confirm payment first.');return}
 const email=$('issue-email').value.trim(),requestId=$('issue-ref').value.trim(),plan=$('issue-plan').value;
 const days=plan==='weekly'?7:plan==='yearly'?365:30;
 if(!confirm('You verified payment for the '+plan+' plan from '+email+'. Activate/extend for '+days+' days?'))return;
 const btn=ev.currentTarget.querySelector('button[type=submit]');btn.disabled=true;
 try{
  const result=await call('issue','POST',{email,plan,requestId:requestId||undefined,confirmPaid:true});
  $('issued').hidden=false;$('issued-code').textContent=result.code;
  $('issued-expiry').textContent=result.days+'-day '+result.plan+' membership expires '+utc(result.expiresAt);
  $('issued-mail').textContent=result.emailed?'Access code was emailed to the customer.':(result.mailError||'Email service not configured. Copy the code and send it securely yourself.');
  $('issue-paid').checked=false;feedback('Membership activated for '+result.email);await reload();
 }catch(e){feedback(e.message)}finally{btn.disabled=false}
});
$('copy-code').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('issued-code').textContent);feedback('Code copied')}catch{feedback('Select and copy the code manually.')}});

let supportLinks=[],generatedSupportId=null,supportBusy=false,supportClockOffset=0;
const supportFeedback=t=>$('support-feedback').textContent=t;
function clearSupportURL(){
 generatedSupportId=null;$('support-url').value='';$('generated-support-link').hidden=true;
}
function renderSupportLinks(){
 const now=Date.now()+supportClockOffset,body=$('support-link-rows');body.replaceChildren();
 if(!supportLinks.length){const tr=document.createElement('tr'),td=cell('No temporary links yet.');td.colSpan=3;tr.append(td);body.append(tr)}
 for(const link of supportLinks){
  const active=link.revoked_ms===null&&link.expires_ms>now;
  if(link.id===generatedSupportId&&!active)clearSupportURL();
  const tr=document.createElement('tr'),actions=document.createElement('td');
  tr.append(cell(utc(link.created_ms)+' / '+utc(link.expires_ms)),cell(link.replaced_by?'Regenerated':link.revoked_ms!==null?'Revoked':active?'Active':'Expired'));
  if(active)action(actions,'Revoke',()=>mutateSupportLink('revoke',link.id));
  if(!link.replaced_by)action(actions,'Regenerate',()=>mutateSupportLink('regenerate',link.id));
  for(const button of actions.querySelectorAll('button'))button.disabled=supportBusy;
  tr.append(actions);body.append(tr);
 }
}
async function reloadSupportLinks(){
 try{
  const data=await call('support-links');supportLinks=data.links||[];
  supportClockOffset=data.serverNow-Date.now();renderSupportLinks();
 }catch(e){supportFeedback(e.message);throw e}
}
async function mutateSupportLink(action,id){
 if(supportBusy)return;
 supportBusy=true;$('generate-support-link').disabled=true;renderSupportLinks();
 supportFeedback('Updating temporary links…');
 try{
  const result=await call('support-links','POST',{action,id});
  if(id===generatedSupportId)clearSupportURL();
  if(result.url){
   generatedSupportId=result.id;$('support-url').value=result.url;
   $('support-expiry').textContent='Expires '+utc(result.expiresAt);
   $('generated-support-link').hidden=false;
   supportLinks.unshift({id:result.id,created_ms:result.createdAt,expires_ms:result.expiresAt,revoked_ms:null,replaced_by:null});
  }
  supportFeedback(action==='revoke'?'Link revoked.':action==='regenerate'?'Old link revoked. Copy the new URL now.':'Link generated. Copy the URL now.');
  await reloadSupportLinks();
 }catch(e){supportFeedback(e.message)}finally{supportBusy=false;$('generate-support-link').disabled=false;renderSupportLinks()}
}
$('generate-support-link').addEventListener('click',()=>mutateSupportLink('generate'));
$('reload-support-links').addEventListener('click',()=>reloadSupportLinks().then(()=>supportFeedback('Links refreshed.')).catch(()=>{}));
$('copy-support-link').addEventListener('click',async()=>{
 renderSupportLinks();
 if(!generatedSupportId){supportFeedback('This URL is no longer active. Generate a new link.');return}
 try{await navigator.clipboard.writeText($('support-url').value);supportFeedback('URL copied. You can paste it into a message or PDF.')}catch{$('support-url').select();supportFeedback('Select and copy the URL manually.')}
});
setInterval(()=>{if(!$('admin-content').hidden)renderSupportLinks()},1000);
