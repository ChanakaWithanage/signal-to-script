import {activeSupportLink,supportHeaders,supportJSON} from '../_lib/support-links.js';

const shell=(title,content,script='')=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>${title} | Gold Signal Room</title><link rel="stylesheet" href="/support.css">${script}</head><body><main>${content}</main></body></html>`;
const unavailable=shell('Link unavailable','<h1>This link is unavailable</h1><p>It may have expired or been revoked. Ask the person who shared it for a new link through your original communication channel.</p>');
export async function onRequest({request,env,params}){
 const head=request.method==='HEAD';
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{...supportHeaders,Allow:'GET, HEAD'}});
 const wantsJSON=request.headers.get('Accept')?.includes('application/json');
 try{
  const link=await activeSupportLink(env.DB,params.token);
  if(!link)return wantsJSON?supportJSON({error:'Link unavailable'},404):new Response(head?null:unavailable,{status:404,headers:{...supportHeaders,'Content-Type':'text/html; charset=utf-8'}});
  if(wantsJSON)return new Response(head?null:JSON.stringify({expiresAt:Number(link.expires_ms),serverNow:Date.now()}),{headers:{...supportHeaders,'Content-Type':'application/json'}});
  const content=`<span class="eyebrow">GOLD SIGNAL ROOM</span><h1>Membership support</h1>
<p id="link-status" role="status">This private information link is available for a limited time.</p>
<section id="support-details" hidden>
<p>To proceed with payment and membership access, please email us at <a href="mailto:support@signaltoscript.com">support@signaltoscript.com</a>.</p>
<p>We’ll reply by email with payment instructions and send your access details once payment is confirmed.</p>
<p>For website memberships, you can <a href="/?plan=monthly#pricing" rel="noreferrer">request access on our website</a>.</p>
<p class="note">This link provides information only. It does not grant membership or confirm payment. Share it only with the intended recipient.</p>
</section><noscript><p>Enable JavaScript to view the support information and keep checking this link's availability.</p></noscript>`;
  return new Response(head?null:shell('Membership support',content,'<script defer src="/support.js"></script>'),{headers:{...supportHeaders,'Content-Type':'text/html; charset=utf-8'}});
 }catch{
  return wantsJSON?supportJSON({error:'Link unavailable'},503):new Response(head?null:unavailable,{status:503,headers:{...supportHeaders,'Content-Type':'text/html; charset=utf-8'}});
 }
}
