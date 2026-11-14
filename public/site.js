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
  'supertrend-visual-bridge':'Supertrend Visual Bridge',
  'gold-breakout-15m':'Gold Breakout 15M Strategy'
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
dialog.setAttribute('aria-describedby','gate-description');
dialog.innerHTML='<div class="gate-head"><span class="eyebrow">Free Pine Script v6 download</span><button type="button" class="gate-close" aria-label="Close download dialog">×</button></div>'+
  '<h2 id="gate-title">Your free script is ready</h2>'+
  '<p id="gate-description">Sign in with Google for unlimited free scripts. Your selected download starts automatically.</p>'+
  '<div class="gate-selected" role="group" aria-label="Selected script"><strong class="gate-script-name"></strong><span>Pine Script v6 · Full source code · .pine file</span></div>'+
  '<section class="gate-google-primary" aria-label="Recommended free sign-in">'+
  '<span class="gate-recommended">Recommended · Unlimited downloads</span>'+
  '<h3>Continue with Google</h3>'+
  '<p>Free access to every script. No extra password or payment.</p>'+
  '<div class="gate-google-button" id="gate-google-button" aria-label="Official Google sign-in button"></div>'+
  '</section>'+
  '<div class="gate-separator"><span>Just want one script?</span></div>'+
  '<button type="button" class="gate-guest">Download once as guest</button>'+
  '<p class="gate-guest-note">One free guest download per browser. No sign-in needed.</p>'+
  '<p class="gate-feedback" role="status" aria-live="polite"></p>'+
  '<button type="button" class="btn gate-retry" hidden>Retry download</button>'+
  '<div class="gate-trust"><span>✓ Free, no credit card</span><span>✓ No marketing signup</span></div>'+
  '<div class="gate-privacy"><strong>Only your Google account ID and email are used for sign-in.</strong> We do not request access to Gmail, Google Drive, or trading accounts. <a href="/privacy.html">How we handle your data</a>.</div>'+
  '<p class="gate-help">Google button not loading? <a class="gate-full" href="/join.html">Open the sign-in page</a>.</p>';
document.body.append(dialog);
dialog.querySelector('.gate-close').addEventListener('click',()=>dialog.close());
dialog.querySelector('.gate-guest').addEventListener('click',async()=>{
  if(!selected||busy)return;
  const button=dialog.querySelector('.gate-guest');
  button.disabled=true;
  feedback('Preparing your guest download...');
  try{
    await fileDownload(selected);
    dialog.close();
  }catch(error){
    if(error.status===403){
      button.textContent='Guest download already used';
      feedback('Your guest download is already used. Continue with Google for unlimited free scripts.');
    }else{
      button.disabled=false;
      feedback(error.message);
    }
  }
});
dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
dialog.querySelector('.gate-retry').addEventListener('click',async()=>{if(!selected)return;feedback('Preparing your download...');dialog.querySelector('.gate-retry').hidden=true;try{await fileDownload(selected);dialog.close()}catch(error){feedback(error.message);dialog.querySelector('.gate-retry').hidden=false}});
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
    const message='Choose a Google account to continue.';
    if(dialog.open)feedback(message);
    window.dispatchEvent(new CustomEvent('signal-signin-error',{detail:message}));
    return;
  }
  try{
    if(dialog.open)feedback('Signing you in securely...');
    const response=await fetch('/api/google-login',{
      method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({credential:result.credential})
    });
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'Google sign-in could not be completed.');
    window.dispatchEvent(new Event('signal-signed-in'));
    if(dialog.open&&selected){
      feedback('Preparing your download...');
      try{
        await fileDownload(selected);
        dialog.close();
      }catch(error){
        feedback(error.message||'Download did not complete. Try again.');
        dialog.querySelector('.gate-retry').hidden=false;
      }
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
function showSignIn(slug,message='',state={}){
  selected=slug;
  const guestButton=dialog.querySelector('.gate-guest');
  guestButton.disabled=!!state.guestUsed||state.registrationAvailable===false;
  guestButton.textContent=state.guestUsed?'Guest download already used':'Download once as guest';
  dialog.querySelector('.gate-script-name').textContent=scripts[slug];
  dialog.querySelector('.gate-full').href='/join.html?script='+encodeURIComponent(slug);
  dialog.querySelector('.gate-retry').hidden=true;
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
      catch(error){
        showSignIn(slug,error.status===401?'Your session ended. Sign in to continue.':error.message,state);
        if(error.status!==401)dialog.querySelector('.gate-retry').hidden=false;
      }
    }else{
      showSignIn(slug,state.guestUsed?'Your guest download is used. Google sign-in unlocks the rest.':'',state);
    }
  }catch(error){showSignIn(slug,error.message,{registrationAvailable:false})}
}
// Make the sign-in requirement visible on article download buttons too.
document.querySelectorAll('a[data-download-script]').forEach(a=>{
  if(!a.nextElementSibling?.classList.contains('download-requirement')){
    const note=document.createElement('span');
    note.className='download-requirement';
    note.textContent='1 free guest download · Sign in for unlimited';
    a.insertAdjacentElement('afterend',note);
  }
});
document.querySelectorAll('a[data-download-script]').forEach(a=>a.addEventListener('click',event=>{
  event.preventDefault();
  const slug=a.dataset.downloadScript;
  if(slug)choose(slug);
}));
window.SignalDownloads={fileDownload,scripts,refreshCounts,mountGoogleButton};
