// Regression checks for one-field D1 request form and always-visible crypto checkout.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/checkout.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/checkout.js',import.meta.url),'utf8');
const api=readFileSync(new URL('../functions/api/manual-request.js',import.meta.url),'utf8');
const schema=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');

assert(html.includes('id="premium-manual-form"'), 'Form is directly inside checkout');
assert(html.includes('id="premium-manual-email"') && html.includes('type="email"'),
 'Email address is the only required buyer input');
assert(html.includes('id="premium-manual-message"'), 'Show generated request preview');
assert(html.includes('Request lifetime access · $4.99'), 'Show the manual offer and submit action');
assert(html.indexOf('id="premium-manual-form"')<html.indexOf('id="premium-crypto-details"'),
 'Manual form appears above crypto');
assert(html.includes('<section id="premium-crypto-details"'),
 'Crypto panel must be expanded, not hidden in details');
assert(!html.includes('<details'), 'No collapsed payment widgets');
assert(!html.includes('premium-paypal') && !html.includes('PayPal checkout'),
 'Do not display unavailable PayPal payment');
assert(html.includes('id="premium-payment-widget"'), 'Keep full NOWPayments QR iframe');
assert(html.includes('id="premium-download"'), 'Keep verified crypto download');
assert(js.includes('manualForm.addEventListener(\'submit\''),
 'Submit in place without opening an external email client');
assert(js.includes("fetch('/api/manual-request'"), 'Post the form directly to Cloudflare');
assert(js.includes('updateManualRequest()'), 'Preview tracks the selected script');
assert(!js.includes('mailto:') && !js.includes('paypalApi('),
 'No email app requirement or broken PayPal SDK calls');
assert(schema.includes('CREATE TABLE IF NOT EXISTS premium_manual_requests'),
 'Manual requests must be stored in D1');
assert(api.includes('INSERT INTO premium_manual_requests'),
 'API writes request data into the database');
assert(api.includes('RESEND_API_KEY'), 'Optional email notification support exists');
new Function(js);
console.log('Manual request UI tests passed: one email, selected script, stored message, visible crypto and no PayPal UI.');
