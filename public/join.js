const params=new URLSearchParams(location.search);
const slug=params.get('script'),valid=Object.hasOwn(window.SignalDownloads.scripts,slug);
const form=document.getElementById('join-form'),panel=document.getElementById('join-panel'),member=document.getElementById('join-member');
const status=document.getElementById('join-status'),submit=document.getElementById('join-submit');
const picked=document.getElementById('join-script');
if(valid)picked.textContent='Selected script: '+window.SignalDownloads.scripts[slug];else picked.hidden=true;
function joined(){panel.hidden=true;member.hidden=false;document.getElementById('join-get').hidden=!valid}
async function download(){if(!valid)return;const x=document.getElementById('join-result');x.textContent='Preparing download...';try{await window.SignalDownloads.fileDownload(slug);x.textContent='Your download should now be ready.'}catch(e){x.textContent=e.message}}
document.getElementById('join-get').addEventListener('click',download);
(async()=>{try{const r=await fetch('/api/access',{cache:'no-store'}),x=await r.json();if(x.member)joined();else if(!x.registrationAvailable){submit.disabled=true;status.textContent='Signup requires a Cloudflare D1 database binding. Please use a guest download for now.'}}catch{status.textContent='Unable to check registration status.'}})();
form.addEventListener('submit',async e=>{
 e.preventDefault();if(submit.disabled)return;
 submit.disabled=true;status.textContent='Setting up your free access...';
 try{
  const r=await fetch('/api/join',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('join-email').value,accepted:document.getElementById('join-consent').checked,website:document.getElementById('join-website').value})});
  const x=await r.json();if(!r.ok)throw Error(x.error||'Could not complete signup.');
  status.textContent='';joined();if(valid)download();
 }catch(err){status.textContent=err.message;submit.disabled=false}
});
document.getElementById('join-signout').addEventListener('click',async()=>{
 if(!confirm('Sign out from free downloads on this browser?'))return;
 const r=await fetch('/api/logout',{method:'POST',credentials:'same-origin'});if(r.ok)location.reload();else document.getElementById('join-result').textContent='Sign out failed.';
});
