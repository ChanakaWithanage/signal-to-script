const key = 'sp500-opening-range-breakout-15m.pine';
const approvedSize = 71272;
const approvedDigest = 'da6f5d7f7f4b71e2e09195df2519fee28c902e10b4388e1452a598974079df85';
const releaseToken = '2f9dc9296408cbda26c936643dcf9282c40b8998e93b23fb6bbb361362988201';

async function sha256(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost({ request, env }) {
  const token = request.headers.get('Authorization') ?? '';
  if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(token) ||
      await sha256(new TextEncoder().encode(token.slice(7))) !== releaseToken) {
    return new Response(null, { status: 404 });
  }
  if (!env.PREMIUM_BUCKET) return new Response(null, { status: 503 });
  if (request.headers.get('Content-Length') !== String(approvedSize)) return new Response(null, { status: 400 });

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength !== approvedSize || await sha256(bytes) !== approvedDigest) {
    return new Response(null, { status: 400 });
  }

  await env.PREMIUM_BUCKET.put(key, bytes, { onlyIf: { etagDoesNotMatch: '*' } });
  const stored = await env.PREMIUM_BUCKET.get(key);
  if (!stored) return new Response(null, { status: 503 });
  const digest = await sha256(await stored.arrayBuffer());
  return new Response(null, { status: digest === approvedDigest ? 204 : 409 });
}
