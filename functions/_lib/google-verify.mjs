// Verifies a Google Identity Services RS256 ID token with Google's published signing keys.
// No Google client secret is required. Fail closed on network or key errors.
const JWKS_URL='https://www.googleapis.com/oauth2/v3/certs';
let cachedKeys=null,cacheUntil=0;
function decodeBase64Url(text){
 if(typeof text!=='string'||!/^[A-Za-z0-9_-]+$/.test(text))throw Error('Invalid token encoding');
 const padded=text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4);
 return Uint8Array.from(atob(padded),c=>c.charCodeAt(0));
}
function decodeJson(text){return JSON.parse(new TextDecoder().decode(decodeBase64Url(text)))}
async function googleKeys(fetcher){
 if(fetcher===fetch && cachedKeys && Date.now()<cacheUntil)return cachedKeys;
 const response=await fetcher(JWKS_URL,{headers:{'Accept':'application/json'}});
 if(!response.ok)throw Error('Google signing keys unavailable');
 const payload=await response.json();
 if(!Array.isArray(payload.keys)||!payload.keys.length)throw Error('Invalid Google signing keys');
 if(fetcher===fetch){
  const match=(response.headers.get('cache-control')||'').match(/max-age=(\d+)/);
  const seconds=Math.min(3600,Math.max(60,match?Number(match[1]):300));
  cachedKeys=payload.keys;cacheUntil=Date.now()+seconds*1000;
 }
 return payload.keys;
}
export async function verifyGoogleCredential(token,audience,{fetcher=fetch,now=()=>Date.now()}={}){
 if(typeof token!=='string'||token.length>10000)throw Error('Invalid Google credential');
 const parts=token.split('.');
 if(parts.length!==3||parts.some(p=>!p))throw Error('Invalid Google credential');
 const [encodedHeader,encodedPayload,sig]=parts;
 const header=decodeJson(encodedHeader),claims=decodeJson(encodedPayload);
 if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>256)throw Error('Unsupported Google signature');
 const keys=await googleKeys(fetcher);
 const jwk=keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.alg==='RS256'&&k.use==='sig');
 if(!jwk)throw Error('Google signing key not found');
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodeBase64Url(sig),new TextEncoder().encode(encodedHeader+'.'+encodedPayload));
 if(!valid)throw Error('Invalid Google signature');
 const seconds=Math.floor(now()/1000);
 if(!['accounts.google.com','https://accounts.google.com'].includes(claims.iss))throw Error('Invalid Google issuer');
 if(claims.aud!==audience)throw Error('Google client ID mismatch');
 if(!Number.isFinite(claims.exp)||seconds>=claims.exp)throw Error('Expired Google credential');
 if(!Number.isFinite(claims.iat)||claims.iat>seconds+60)throw Error('Invalid Google token date');
 if(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>seconds+60))throw Error('Google credential not yet valid');
 if(typeof claims.sub!=='string'||!claims.sub||claims.sub.length>255)throw Error('Missing Google account ID');
 if(claims.email_verified!==true||typeof claims.email!=='string'||claims.email.length>254)throw Error('Google email is not verified');
 return {sub:claims.sub,email:claims.email};
}
