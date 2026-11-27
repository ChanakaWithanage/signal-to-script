import {json} from '../_lib/access.js';
export async function onRequestGet({env}){
 const name=String(env.PUBLIC_TELEGRAM_CHANNEL||'').trim();
 return json({username:/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name)?name:null});
}
