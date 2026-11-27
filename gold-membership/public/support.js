'use strict';
(()=>{
 const details=document.getElementById('support-details'),status=document.getElementById('link-status');
 let deadline=0,checking=false,generation=0;
 const hide=()=>{details.hidden=true;deadline=0;generation++};
 const unavailable=()=>{details.hidden=true;deadline=0;status.textContent='This link is unavailable. It may have expired or been revoked. Ask for a new link through your original communication channel.'};
 async function check(){
  if(checking||document.hidden)return;
  checking=true;
  const current=++generation,start=performance.now();
  try{
   const response=await fetch(location.pathname,{cache:'no-store',credentials:'omit',headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000)});
   if(!response.ok)throw Error('Unavailable');
   const data=await response.json();
   if(current!==generation||document.hidden)return;
   // Use server time, accounting conservatively for the round trip and local clock skew.
   const remaining=data.expiresAt-data.serverNow-(performance.now()-start);
   if(!Number.isFinite(remaining)||remaining<=0)throw Error('Expired');
   deadline=performance.now()+remaining;details.hidden=false;
   tick();
  }catch{if(current===generation)unavailable()}finally{checking=false;if(current!==generation&&!document.hidden)check()}
 }
 function tick(){
  if(!deadline)return;
  const seconds=Math.ceil((deadline-performance.now())/1000);
  if(seconds<=0){unavailable();return}
  status.textContent='Link expires in '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+'.';
 }
 // Clear visible information when leaving, including back/forward cache restoration.
 addEventListener('pagehide',hide);
 addEventListener('pageshow',()=>{hide();check()});
 document.addEventListener('visibilitychange',()=>{hide();if(!document.hidden)check()});
 setInterval(check,10000);setInterval(tick,1000);
 if(document.readyState==='complete')check();
})();
