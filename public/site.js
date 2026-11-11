// Download choice and real download counts for Signal to Script.
const menu=document.getElementById('menu'),nav=document.getElementById('nav');
if(menu&&nav){menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open))});nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')))}
const scripts={
 'supertrend-dema-reversal':'Supertrend + DEMA Reversal Strategy',
 '1r-bear-breakout-achievements':'1R Bear Breakout Achievements',
 'goat-trap-pinbar-3ls-combo':'Goat Trap Pinbar + 3LS',
 'supertrend-visual-bridge':'Supertrend Visual Bridge'
};
const guestKey='sts_guest_download_used';
const localUsed=()=>{try{return localStorage.getItem(guestKey)==='1'}catch{return false}};
const rememberUsed=()=>{try{localStorage.setItem(guestKey,'1')}catch{}};
async function refreshCounts(){
 const nodes=[...document.querySelectorAll('[data-download-count]')];
 await Promise.all([...new Set(nodes.map(n=>n.dataset.downloadCount))].map(async slug=>{
   try{const r=await fetch('/api/count?script='+encodeURIComponent(slug),{cache:'no-store'});if(!r.ok)return;const x=await r.json();if(!Number.isSafeInteger(x.count)||x.count<0)return;nodes.filter(n=>n.dataset.downloadCount===slug).forEach(n=>n.textContent=new Intl.NumberFormat('en-US').format(x.count)+' downloads')}catch{}
 }));
}
refreshCounts();
const dialog=document.createElement('dialog');
dialog.className='download-gate';
dialog.setAttribute('aria-labelledby','gate-title');
dialog.innerHTML='<div class="gate-head"><span class="eyebrow">Free Pine Script v6</span><button type="button" class="gate-close" aria-label="Close">×</button></div>'+
 '<h2 id="gate-title">Unlock your next indicator for free</h2>'+
 '<p>Join Signal to Script for every free script, plus installation help and technical guidance. No credit card required.</p>'+
 '<p class="gate-selected"></p>'+
 '<ul><li>Complete Pine Script source code</li><li>Help with setup and configuration</li><li>Access to more free indicator downloads</li></ul>'+
 '<a class="btn gate-join" href="/join.html">Join free and download</a>'+
 '<button type="button" class="gate-guest">Continue as guest, 1 free download</button>'+
 '<p class="gate-feedback" role="status" aria-live="polite"></p>'+
 '<small>Joining is optional. Existing public source code is not paywalled.</small>';
document.body.append(dialog);
dialog.querySelector('.gate-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
let chosen=null,busy=false;
const feedback=s=>{dialog.querySelector('.gate-feedback').textContent=s};
async function access(){const r=await fetch('/api/access',{cache:'no-store',credentials:'same-origin'});if(!r.ok)throw Error('Cannot check download access right now.');return r.json()}
function showChoice(slug,state={}){
 chosen=slug;
 dialog.querySelector('.gate-selected').textContent=scripts[slug]||slug;
 const link=dialog.querySelector('.gate-join');
 link.href='/join.html?script='+encodeURIComponent(slug);
 link.hidden=state.registrationAvailable!==true;
 const used=localUsed()||state.guestUsed;
 const btn=dialog.querySelector('.gate-guest');
 btn.disabled=!!used;
 btn.textContent=used?'Guest download already used':'Continue as guest, 1 free download';
 feedback(used?'Join free to access more scripts. The guest limit is one per browser.':state.registrationAvailable?'No payment needed. You can also download one script without signing up.':'Signup requires Cloudflare D1 configuration. Guest download is available.');
 if(!dialog.open)dialog.showModal();
}
async function fileDownload(slug){
 if(busy)throw Error('Another download is in progress.');
 busy=true;
 try{
  const r=await fetch('/api/download?script='+encodeURIComponent(slug),{credentials:'same-origin',cache:'no-store'});
  if(!r.ok){
   let message='Download unavailable. Please try again.';
   try{const x=await r.json();message=x.error||message}catch{if(r.status===503)message='Download service temporarily unavailable.'}
   if(r.status===403)rememberUsed();
   throw Error(message);
  }
  const file=await r.blob(),url=URL.createObjectURL(file),a=document.createElement('a');
  a.href=url;a.download=slug+'.pine';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
  refreshCounts();
  return true;
 }finally{busy=false}
}
dialog.querySelector('.gate-guest').addEventListener('click',async()=>{
 const btn=dialog.querySelector('.gate-guest');if(btn.disabled||!chosen)return;
 btn.disabled=true;feedback('Preparing your download...');
 try{await fileDownload(chosen);rememberUsed();dialog.close()}catch(e){feedback(e.message);btn.disabled=localUsed()}
});
async function choose(slug){
 if(!Object.hasOwn(scripts,slug))return;
 try{const state=await access();if(state.member){try{await fileDownload(slug)}catch(e){showChoice(slug,state);feedback(e.message)}}else showChoice(slug,state)}
 catch(e){showChoice(slug,{registrationAvailable:false,guestUsed:localUsed()});feedback(e.message)}
}
document.querySelectorAll('a[href^="/api/download?"]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const slug=new URL(a.href).searchParams.get('script');if(slug)choose(slug)}));
window.SignalDownloads={fileDownload,scripts,refreshCounts};
