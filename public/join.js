// Verified Google sign-in for Signal to Script free downloads.
const GOOGLE_CLIENT_ID='121639481880-4lrf81h9me5o35tdv3p9jjb4gmr9983b.apps.googleusercontent.com';
const params=new URLSearchParams(location.search);
const slug=params.get('script');
const valid=Object.hasOwn(window.SignalDownloads.scripts,slug);
const panel=document.getElementById('join-panel');
const member=document.getElementById('join-member');
const status=document.getElementById('join-status');
const picked=document.getElementById('join-script');
if(valid)picked.textContent='Selected script: '+window.SignalDownloads.scripts[slug];else picked.hidden=true;
function joined(){panel.hidden=true;member.hidden=false;document.getElementById('join-get').hidden=!valid;}
async function downloadSelected(){
 if(!valid)return;
 const output=document.getElementById('join-result');
 output.textContent='Preparing your download...';
 try{
  await window.SignalDownloads.fileDownload(slug);
  output.textContent='Your script has been downloaded.';
 }catch(error){output.textContent=error.message;}
}
document.getElementById('join-get').addEventListener('click',downloadSelected);
async function onGoogleCredential(response){
 if(!response?.credential){status.textContent='Google did not return a sign-in credential. Please try again.';return;}
 status.textContent='Signing you in securely...';
 try{
  const result=await fetch('/api/google-login',{
   method:'POST',credentials:'same-origin',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({credential:response.credential})
  });
  const data=await result.json();
  if(!result.ok)throw Error(data.error||'Google sign-in could not be completed.');
  status.textContent='';
  joined();
  if(valid)downloadSelected();
 }catch(error){status.textContent=error.message;}
}
function initializeGoogle(){
 const placeholder=document.getElementById('google-button');
 if(!window.google?.accounts?.id){
  status.textContent='Google sign-in could not load. Please refresh the page.';
  return;
 }
 google.accounts.id.initialize({
  client_id:GOOGLE_CLIENT_ID,
  callback:onGoogleCredential,
  auto_select:false,
  cancel_on_tap_outside:true,
  ux_mode:'popup'
 });
 google.accounts.id.renderButton(placeholder,{
  type:'standard',theme:'outline',size:'large',text:'continue_with',
  shape:'rectangular',logo_alignment:'left',width:300
 });
}
function loadGoogle(){
 const script=document.createElement('script');
 script.src='https://accounts.google.com/gsi/client';
 script.async=true;
 script.onload=initializeGoogle;
 script.onerror=()=>{status.textContent='Google sign-in could not load. Please check your connection and refresh.';};
 document.head.append(script);
}
(async()=>{
 try{
  const response=await fetch('/api/access',{cache:'no-store',credentials:'same-origin'});
  const result=await response.json();
  if(result.member){joined();return;}
  if(!result.registrationAvailable){
   status.textContent='Free sign-in is temporarily unavailable. Please try again shortly.';
   return;
  }
  loadGoogle();
 }catch{
  status.textContent='Sign-in service is temporarily unavailable. Please refresh and try again.';
 }
})();
document.getElementById('join-signout').addEventListener('click',async()=>{
 try{
  const response=await fetch('/api/logout',{method:'POST',credentials:'same-origin'});
  if(!response.ok)throw Error('Sign out failed.');
  if(window.google?.accounts?.id)google.accounts.id.disableAutoSelect();
  window.location.reload();
 }catch(error){document.getElementById('join-result').textContent=error.message;}
});
