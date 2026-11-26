import {json,clearCookie,sameOrigin} from '../_lib/access.js';
export async function onRequestPost({request}){
 if(!sameOrigin(request))return json({error:'Invalid request origin.'},403);
 const res=json({ok:true});
 res.headers.append('Set-Cookie',clearCookie());
 return res;
}
