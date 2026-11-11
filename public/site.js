// Simple Google sign-in to download free Pine Script v6 source code.
const menu=document.getElementById('menu'),nav=document.getElementById('nav');
if(menu&&nav){
  menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open))});
  nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));
}
const scripts={
  'supertrend-dema-reversal':'Supertrend + DEMA Reversal Strategy',
  '1r-bear-breakout-achievements':'1R Bear Breakout Achievements',
  'goat-trap-pinbar-3ls-combo':'Goat Trap Pinbar + 3LS',
  'supertrend-visual-bridge':'Supertrend Visual Bridge'
};
const GOOGLE_CLIENT_ID='121639481880-4lrf81h9me5o35tdv3p9jjb4gmr9983b.apps.googleusercontent.com';
async function refreshCounts(){
  const nodes=[...document.querySelectorAll('[data-download-count]')];
  await Promise.all([...new Set(nodes.map(n=>n.dataset.downloadCount))].map(async slug=>{
    try{
      const response=await fetch('/api/count?script='+encodeURIComponent(slug),{cache:'no-store'});
      if(!response.ok)return;
      const data=await response.json();
      if(!Number.isSafeInteger(data.count)||data.count<0)return;
      nodes.filter(n=>n.dataset.downloadCount===slug)
        .forEach(n=>n.textContent=new Intl.NumberFormat('en-US').format(data.count)+' downloads');
    }catch{}
  }));
}
refreshCounts();
const dialog=document.createElement('dialog');
dialog.className='download-gate';
dialog.setAttribute('aria-labelledby','gate-title');
dialog.innerHTML='<div class="gate-head"><span class="eyebrow">Free Pine Script v6</span><button type="button" class="gate-close" aria-label="Close">×</button></div>'+
  '<h2 id="gate-title">Your free script is one sign-in away</h2>'+
  '<p>Continue with Google to get the complete Pine Script and help with setup. No payment or password to create.</p>'+
  '<p class="gate-selected"></p>'+
  '<div class="gate-google-button" id="gate-google-button"></div>'+
  '<p class="gate-feedback" role="status" aria-live="polite"></p>'+
  '<small>By continuing, you agree to our <a href="/privacy.html">privacy notice</a>.</small>';
document.body.append(dialog);
dialog.querySelector('.gate-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
let selected=null,busy=false;
const feedback=message=>{dialog.querySelector('.gate-feedback').textContent=message};
let googleLoader=null,googleInitialized=false;
function loadGoogle(){
  if(window.google?.accounts?.id)return Promise.resolve();
  if(!googleLoader){
    googleLoader=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://accounts.google.com/gsi/client';
      script.async=true;
      script.onload=()=>window.google?.accounts?.id?resolve():reject(Error('Google sign-in did not load.'));
      script.onerror=()=>reject(Error('Google sign-in could not load. Please check your connection.'));
      document.head.append(script);
    }).catch(error=>{googleLoader=null;throw error});
  }
  return googleLoader;
}
async function fileDownload(slug){
  if(!Object.hasOwn(scripts,slug))throw Error('Script not found.');
  if(busy)throw Error('A download is already in progress.');
  busy=true;
  try{
    const response=await fetch('/api/download?script='+encodeURIComponent(slug),{
      credentials:'same-origin',cache:'no-store'
    });
    if(!response.ok){
      let message='Download unavailable. Please try again.';
      try{const data=await response.json();message=data.error||message}catch{}
      const error=new Error(message);
      error.status=response.status;
      throw error;
    }
    const blob=await response.blob();
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;link.download=slug+'.pine';
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
    refreshCounts();
    return true;
  }finally{busy=false}
}
async function onGoogleCredential(result){
  if(!result?.credential){
    window.dispatchEvent(new CustomEvent('signal-signin-error',{detail:'Please choose a Google account to continue.'}));
    return;
  }
  try{
    if(dialog.open)feedback('Signing you in...');
    const response=await fetch('/api/google-login',{
      method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({credential:result.credential})
    });
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'Google sign-in could not be completed.');
    window.dispatchEvent(new Event('signal-signed-in'));
    if(dialog.open&&selected){
      feedback('Preparing your script...');
      await fileDownload(selected);
      dialog.close();
    }
  }catch(error){
    if(dialog.open)feedback(error.message);
    window.dispatchEvent(new CustomEvent('signal-signin-error',{detail:error.message}));
  }
}
async function mountGoogleButton(element){
  await loadGoogle();
  if(!googleInitialized){
    google.accounts.id.initialize({
      client_id:GOOGLE_CLIENT_ID,
      callback:onGoogleCredential,
      auto_select:false,
      cancel_on_tap_outside:true,
      ux_mode:'popup'
    });
    googleInitialized=true;
  }
  element.replaceChildren();
  google.accounts.id.renderButton(element,{
    type:'standard',theme:'outline',size:'large',
    text:'continue_with',shape:'rectangular',
    logo_alignment:'left',width:300
  });
}
function showSignIn(slug,message=''){
  selected=slug;
  dialog.querySelector('.gate-selected').textContent=scripts[slug];
  feedback(message);
  if(!dialog.open)dialog.showModal();
  mountGoogleButton(dialog.querySelector('#gate-google-button')).catch(error=>feedback(error.message));
}
async function choose(slug){
  if(!Object.hasOwn(scripts,slug))return;
  try{
    const response=await fetch('/api/access',{cache:'no-store',credentials:'same-origin'});
    if(!response.ok)throw Error('Cannot check your sign-in right now.');
    const state=await response.json();
    if(state.member){
      try{await fileDownload(slug)}
      catch(error){showSignIn(slug,error.status===401?'Your session ended. Sign in to continue.':error.message)}
    }else{
      showSignIn(slug);
    }
  }catch(error){showSignIn(slug,error.message)}
}
document.querySelectorAll('a[href^="/api/download?"]').forEach(a=>a.addEventListener('click',event=>{
  event.preventDefault();
  const slug=new URL(a.href).searchParams.get('script');
  if(slug)choose(slug);
}));
window.SignalDownloads={fileDownload,scripts,refreshCounts,mountGoogleButton};
