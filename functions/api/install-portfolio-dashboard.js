// One-time installation of the verified dashboard release into private storage.
export async function onRequestPost({ request, env }) {
  const key = 'portfolio-trend-dashboard.pine';
  const expected = '409f50d7798d855dcadf4913637e962479147d2bbac3bf58b022479da998930f';
  if (!env.PREMIUM_BUCKET) return new Response('Missing private bucket', { status: 503 });
  if (request.headers.get('Content-Length') !== '23678') return new Response(null, { status: 400 });
  const bytes = await request.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const digest = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  if (digest !== expected) return new Response(null, { status: 403 });
  await env.PREMIUM_BUCKET.put(key, bytes, { onlyIf: { etagDoesNotMatch: '*' } });
  const stored = await env.PREMIUM_BUCKET.get(key);
  if (!stored) return new Response(null, { status: 503 });
  const result = await crypto.subtle.digest('SHA-256', await stored.arrayBuffer());
  const matches = new Uint8Array(result).every((value, i) => value === new Uint8Array(hash)[i]);
  return new Response(matches ? 'Verified private release' : 'Object conflict', { status: matches ? 200 : 409 });
}
