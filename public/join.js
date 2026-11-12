// Minimal sign-in page. Site.js loads Google and exchanges the signed ID token.
const params=new URLSearchParams(location.search);
const slug=params.get('script');
const valid=Object.hasOwn(window.SignalDownloads.scripts,slug);
const panel=document.getElementById('join-panel');
const member=document.getElementById('join-member');
const status=document.getElementById('join-status');
const picked=document.getElementById('join-script');
if(valid)picked.textContent='Selected script: '+window.SignalDownloads.scripts[slug];
else picked.hidden=true;
function joined(){
  panel.hidden=true;
  member.hidden=false;
  document.getElementById('join-get').hidden=!valid;
}
async function downloadSelected(){
  if(!valid)return;
  const output=document.getElementById('join-result');
  output.textContent='Preparing your download...';
  try{
    await window.SignalDownloads.fileDownload(slug);
    output.textContent='Your script has been downloaded.';
  }catch(error){output.textContent=error.message}
}
document.getElementById('join-get').addEventListener('click',downloadSelected);
window.addEventListener('signal-signed-in',()=>{
  status.textContent='';
  joined();
  if(valid)downloadSelected();
});
window.addEventListener('signal-signin-error',event=>{
  status.textContent=event.detail||'Sign-in could not be completed.';
});
(async()=>{
  try{
    const response=await fetch('/api/access',{credentials:'same-origin',cache:'no-store'});
    if(!response.ok)throw Error('Sign-in service is temporarily unavailable.');
    const state=await response.json();
    if(state.member){joined();if(valid)downloadSelected();return}
    if(!state.registrationAvailable)throw Error('Free sign-in is temporarily unavailable.');
    await window.SignalDownloads.mountGoogleButton(document.getElementById('google-button'));
  }catch(error){status.textContent=error.message}
})();
document.getElementById('join-signout').addEventListener('click',async()=>{
  try{
    const response=await fetch('/api/logout',{method:'POST',credentials:'same-origin'});
    if(!response.ok)throw Error('Sign out failed.');
    if(window.google?.accounts?.id)google.accounts.id.disableAutoSelect();
    window.location.reload();
  }catch(error){document.getElementById('join-result').textContent=error.message}
});
