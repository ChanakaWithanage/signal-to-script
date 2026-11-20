// Regression checks for PayPal-first layout and correct hosted/payment return routing.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/checkout.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/checkout.js',import.meta.url),'utf8');
const paypal=readFileSync(new URL('../functions/api/paypal.js',import.meta.url),'utf8');
const premium=readFileSync(new URL('../functions/api/premium.js',import.meta.url),'utf8');
assert(html.indexOf('premium-paypal-sdk-area')<html.indexOf('premium-crypto-details'),
  'PayPal must be above the crypto option');
assert(html.includes('<details id="premium-crypto-details"'),
  'Crypto should be collapsed initially');
assert(html.includes('premium-paypal-wallet-buttons'));
assert(html.includes('premium-paypal-card-buttons'));
assert(!html.includes('id="premium-paypal-start"'),
  'Do not re-enable the old full-page redirect button');
assert(js.includes('https://www.paypal.com/sdk/js?'),
  'Load the official PayPal checkout SDK');
assert(js.includes("color:'gold'")&&js.includes('sdk.FUNDING.PAYPAL'),
  'Show PayPal gold button');
assert(js.includes('sdk.FUNDING.CARD')&&js.includes('card?.isEligible()'),
  'Use eligibility-gated card funding');
assert(js.includes('onApprove:async data=>')&&js.includes("paypalApi('capture'"),
  'Capture approved payments on our server');
assert(js.includes('restorePaypalByProviderId'),
  'Match PayPal orders when buyer changes scripts during approval');
assert(!js.includes('location.assign(response.approvalUrl)'),
  'Do not navigate to the old PayPal approval URL');
assert(paypal.includes("return_url:'https://signaltoscript.com/checkout?"),
  'Return to the canonical Cloudflare Pages route');
assert(paypal.includes("cancel_url:'https://signaltoscript.com/checkout?"),
  'Cancel back to the canonical Cloudflare Pages route');
assert(premium.includes('paypalClientId:'),
  'Expose only PayPal public client ID for SDK');
assert(!premium.includes('paypalClientSecret:'),
  'Never expose PayPal secret in the SDK config');
new Function(js);
console.log('Checkout UI regression checks passed: gold PayPal, eligible cards, canonical URL, verified capture and crypto fallback.');
