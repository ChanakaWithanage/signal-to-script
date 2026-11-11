// Offline JWT verification regression tests. No Google service calls or secrets required.
import assert from 'node:assert/strict';
import {createSign,generateKeyPairSync,webcrypto} from 'node:crypto';
import {verifyGoogleCredential} from '../functions/_lib/google-verify.mjs';
globalThis.crypto ??= webcrypto;
const audience='121639481880-4lrf81h9me5o35tdv3p9jjb4gmr9983b.apps.googleusercontent.com';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const key={...publicKey.export({format:'jwk'}),kid:'local-key',alg:'RS256',use:'sig'};
const fetcher=async()=>({ok:true,json:async()=>({keys:[key]}),headers:new Headers()});
const t=Math.floor(Date.now()/1000);
const payload={
 iss:'https://accounts.google.com',aud:audience,
 sub:'google-test-sub',email:'test@example.com',email_verified:true,
 iat:t-10,exp:t+3600
};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function signedToken(claims,header={alg:'RS256',kid:'local-key'}){
 const unsigned=encode(header)+'.'+encode(claims);
 return unsigned+'.'+createSign('RSA-SHA256').update(unsigned).end().sign(privateKey).toString('base64url');
}
const valid=await verifyGoogleCredential(signedToken(payload),audience,{fetcher});
assert.deepEqual(valid,{sub:'google-test-sub',email:'test@example.com'});
async function rejects(claims,detail,header){
 await assert.rejects(verifyGoogleCredential(signedToken(claims,header),audience,{fetcher}),detail);
}
await rejects({...payload,aud:'wrong-client.apps.googleusercontent.com'},/audience|client ID/);
await rejects({...payload,iss:'https://attacker.invalid'},/issuer/);
await rejects({...payload,exp:t-1},/Expired/);
await rejects({...payload,email_verified:false},/not verified/);
await rejects({...payload,iat:t+600},/date/);
await rejects(payload,/Unsupported Google signature/,{alg:'HS256',kid:'local-key'});
const parts=signedToken(payload).split('.');
parts[1]=encode({...payload,email:'impostor@example.com'});
await assert.rejects(verifyGoogleCredential(parts.join('.'),audience,{fetcher}),/signature/);
await assert.rejects(verifyGoogleCredential('fake',audience,{fetcher}),/credential/);
console.log('Google JWT cryptographic validation tests passed.');
