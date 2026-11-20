// Regression checks for PayPal-first layout and correct hosted/payment return routing.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/checkout.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/checkout.js',import.meta.url),'utf8');
const paypal=readFileSync(new URL('../functions/api/paypal.js',import.meta.url),'utf8');
const premium=readFileSync(new URL('../functions/api/premium.js',import.meta.url),'utf8');
assert(html.indexOf('id="manual-script-request"')<html.indexOf('id="premium-paypal-details"'),
  'Manual $4.99 request must be the primary checkout option');
assert(html.indexOf('id="premium-paypal-details"')<html.indexOf('id="premium-crypto-details"'),
  'Optional PayPal and crypto methods should remain available');
assert(html.includes('<strong>$4.99</strong>')&&html.includes('Request this script for $4.99'),
  'Manual offer must clearly show the $4.99 USD amount');
assert(html.includes('If PayPal Goods &amp; Services receiving is available'),
  'Do not promise a PayPal transfer when the receiving account is ineligible');
assert(html.includes('delivered manually after verified payment'),
  'Manual contact option must not promise automatic delivery');
assert(js.includes('mailto:support@signaltoscript.com?subject=')&&
  js.includes('encodeURIComponent(subject)')&&js.includes('encodeURIComponent(body)'),
  'Email request must contain the selected script and amount');
assert(js.includes('updateManualRequest();')&&js.includes('id="premium-manual-request"')===false,
  'Manual link must update for the selected product');
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
console.log('Checkout UI regression checks passed: $4.99 email request, optional PayPal, eligible cards, canonical URL and crypto fallback.');
