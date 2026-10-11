import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createAccessVerifier } from '../server/access.mjs';

const team = 'team.cloudflareaccess.com';
const aud = 'aud-tag';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const nowMs = 1_800_000_000_000;

const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function token(claims = {}, header = {}, key = privateKey) {
  const head = b64({ alg: 'RS256', kid: 'k1', typ: 'JWT', ...header });
  const body = b64({ iss: `https://${team}`, aud: [aud], exp: nowMs / 1000 + 300, email: 'a@example.com', ...claims });
  return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url')}`;
}
function verifier(fetchJwks = async () => ({ keys: [jwk] })) {
  return createAccessVerifier({ teamDomain: team, audience: aud, fetchJwks, now: () => nowMs });
}

test('accepts a valid Access token and returns its claims', async () => {
  const claims = await verifier()(token());
  assert.equal(claims.email, 'a@example.com');
});

test('rejects missing, expired, wrong-audience, wrong-issuer, and forged tokens', async () => {
  const verify = verifier();
  await assert.rejects(verify(undefined), /Missing/);
  await assert.rejects(verify(token({ exp: nowMs / 1000 - 1 })), /expired/);
  await assert.rejects(verify(token({ aud: ['other'] })), /audience/);
  await assert.rejects(verify(token({ iss: 'https://evil.example' })), /issuer/);
  const { privateKey: otherKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  await assert.rejects(verify(token({}, {}, otherKey)), /signature/);
  await assert.rejects(verify(token({}, { alg: 'none' })), /algorithm/);
});

test('refetches keys for an unknown kid at most once a minute', async () => {
  let fetches = 0;
  const verify = verifier(async () => { fetches++; return { keys: [jwk] }; });
  await verify(token());
  await assert.rejects(verify(token({}, { kid: 'rotated' })), /Unknown/);
  await assert.rejects(verify(token({}, { kid: 'rotated' })), /Unknown/);
  assert.equal(fetches, 1);
});

test('requires configuration', () => {
  assert.throws(() => createAccessVerifier({ teamDomain: team }), /audience/);
});
