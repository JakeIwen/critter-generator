import { createPublicKey, verify } from 'node:crypto';

// Verifies the Cloudflare Access JWT (Cf-Access-Jwt-Assertion) that Access
// adds to every request it lets through. Checking it here means a tunnel or
// DNS mistake fails closed instead of exposing the app.
export function createAccessVerifier({ teamDomain, audience, fetchJwks = defaultFetchJwks, now = () => Date.now() }) {
  if (!teamDomain || !audience) throw new Error('Access verification needs a team domain and an audience tag.');
  const issuer = `https://${teamDomain}`;
  let keys = new Map();
  let fetchedAt = 0;

  async function refresh() {
    // Throttle refetches so a flood of bad tokens can't hammer the certs endpoint.
    if (now() - fetchedAt < 60_000 && keys.size) return;
    const jwks = await fetchJwks(`${issuer}/cdn-cgi/access/certs`);
    keys = new Map(jwks.keys.filter(k => k.kty === 'RSA').map(k => [k.kid, createPublicKey({ key: k, format: 'jwk' })]));
    fetchedAt = now();
  }

  return async function verifyAccessToken(token) {
    const parts = typeof token === 'string' ? token.split('.') : [];
    if (parts.length !== 3) throw new Error('Missing Access token.');
    const [headerPart, payloadPart, signaturePart] = parts;
    const header = decodeJson(headerPart);
    if (header.alg !== 'RS256') throw new Error('Unexpected Access token algorithm.');
    if (!keys.has(header.kid)) await refresh();
    const key = keys.get(header.kid);
    if (!key) throw new Error('Unknown Access signing key.');
    const signed = Buffer.from(`${headerPart}.${payloadPart}`);
    if (!verify('RSA-SHA256', signed, key, Buffer.from(signaturePart, 'base64url'))) throw new Error('Invalid Access token signature.');
    const claims = decodeJson(payloadPart);
    const seconds = now() / 1000;
    if (claims.iss !== issuer) throw new Error('Access token issuer mismatch.');
    if (![claims.aud].flat().includes(audience)) throw new Error('Access token audience mismatch.');
    if (typeof claims.exp !== 'number' || claims.exp <= seconds) throw new Error('Access token expired.');
    if (typeof claims.nbf === 'number' && claims.nbf > seconds + 60) throw new Error('Access token not yet valid.');
    return claims;
  };
}

function decodeJson(part) {
  try { return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')); } catch { throw new Error('Malformed Access token.'); }
}

async function defaultFetchJwks(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Access certs request failed (${response.status}).`);
  return response.json();
}
