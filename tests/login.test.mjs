import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createLogin, COOKIE } from '../server/login.mjs';

const origin = 'https://critter.example.test';
const ownerEmail = 'owner@example.test';
const dir = mkdtempSync(path.join(tmpdir(), 'critter-login-'));

async function serve(options = {}) {
  let clock = 1_800_000_000_000;
  const login = createLogin({ publicOrigin: new URL(origin), passcode: 'open sesame', secretFile: path.join(dir, 'secret'),
    allowedEmails: () => [ownerEmail],
    verifyAccess: async token => { if (token !== 'good') throw new Error('bad'); return { email: ownerEmail }; }, now: () => clock, ...options });
  const app = express();
  app.use(login.router);
  app.use((req, res, next) => login.signedIn(req) ? next() : login.challenge(req, res));
  app.get('/', (_req, res) => res.send('home'));
  app.get('/api/status', (_req, res) => res.json({ ok: true }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, init = {}) => fetch(base + url, { redirect: 'manual', ...init });
  const enter = (passcode, headers = { origin }) => request('/auth/passcode', { method: 'POST', body: new URLSearchParams({ passcode }),
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers } });
  return { request, enter, login, advance: ms => { clock += ms; }, close: () => server.close() };
}
const session = res => res.headers.get('set-cookie')?.split(';')[0];

test('signed-out pages go to the sign-in form and API calls get 401', async t => {
  const s = await serve(); t.after(s.close);
  const page = await s.request('/', { headers: { accept: 'text/html' } });
  assert.equal(page.status, 302); assert.equal(page.headers.get('location'), '/auth');
  assert.equal((await s.request('/api/status')).status, 401, 'fetch sends Accept: */*');
  const form = await s.request('/auth');
  assert.equal(form.status, 200); assert.match(await form.text(), /name="passcode"/);
});

test('the right passcode starts a session; a wrong one does not', async t => {
  const s = await serve(); t.after(s.close);
  assert.equal((await s.enter('nope')).status, 401);
  const ok = await s.enter('open sesame');
  assert.equal(ok.status, 303); assert.equal(ok.headers.get('location'), '/');
  assert.match(ok.headers.get('set-cookie'), new RegExp(`^${COOKIE}=.*HttpOnly; Secure; SameSite=Lax`));
  assert.equal((await s.request('/', { headers: { cookie: session(ok) } })).status, 200);
  assert.equal((await s.request('/', { headers: { cookie: session(ok).replace(/.$/, 'x') } })).status, 302);
  s.advance(8 * 24 * 3600_000);
  assert.equal((await s.request('/', { headers: { cookie: session(ok) } })).status, 302, 'sessions expire');
});

test('passcode posts must come from the app origin', async t => {
  const s = await serve(); t.after(s.close);
  assert.equal((await s.enter('open sesame', {})).status, 403);
  assert.equal((await s.enter('open sesame', { origin: 'https://evil.example' })).status, 403);
});

test('repeated wrong passcodes lock out that address for a while', async t => {
  const s = await serve(); t.after(s.close);
  for (let i = 0; i < 10; i++) assert.equal((await s.enter('nope')).status, 401);
  assert.equal((await s.enter('open sesame')).status, 429);
  s.advance(16 * 60_000);
  assert.equal((await s.enter('open sesame')).status, 303);
});

test('email sign-in needs a valid Access token', async t => {
  const s = await serve(); t.after(s.close);
  assert.equal((await s.request('/auth/email')).status, 403);
  const ok = await s.request('/auth/email', { headers: { 'cf-access-jwt-assertion': 'good' } });
  assert.equal(ok.status, 303);
  assert.equal((await s.request('/', { headers: { cookie: session(ok) } })).status, 200);
});

test('changing the passcode ends passcode sessions but not email ones', async t => {
  const before = await serve(); t.after(before.close);
  const byPasscode = session(await before.enter('open sesame'));
  const byEmail = session(await before.request('/auth/email', { headers: { 'cf-access-jwt-assertion': 'good' } }));
  const after = await serve({ passcode: 'new words' }); t.after(after.close);
  assert.equal((await after.request('/', { headers: { cookie: byPasscode } })).status, 302);
  assert.equal((await after.request('/', { headers: { cookie: byEmail } })).status, 200);
});


test('the owner email starts a signed-in owner session', async t => {
  const s = await serve({ ownerEmail, allowedEmails: () => [] }); t.after(s.close);
  const ok = await s.request('/auth/email', { headers: { 'cf-access-jwt-assertion': 'good' } });
  assert.equal(ok.status, 303);
  assert.match(session(ok), new RegExp(`^${COOKIE}=owner\\.`));
  const req = { headers: { cookie: session(ok) } };
  assert.equal(s.login.signedIn(req), true);
  assert.equal(s.login.isOwner(req), true);
  assert.equal(s.login.sessionMethod(req), 'owner');
  assert.equal((await s.request('/', { headers: req.headers })).status, 200);
});

test('a listed email starts an address-bound ordinary session and normalizes the claim', async t => {
  const email = 'visitor@example.test';
  const s = await serve({ ownerEmail, allowedEmails: () => [email], verifyAccess: async () => ({ email: '  VISITOR@Example.Test  ' }) }); t.after(s.close);
  const ok = await s.request('/auth/email', { headers: { 'cf-access-jwt-assertion': 'good' } });
  assert.equal(ok.status, 303);
  const [method, expires, address, signature] = session(ok).split('=')[1].split('.');
  assert.equal(method, 'email'); assert.match(expires, /^\d+$/); assert.match(signature, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(address, 'base64url').toString(), email);
  const req = { headers: { cookie: session(ok) } };
  assert.equal(s.login.signedIn(req), true);
  assert.equal(s.login.isOwner(req), false);
  assert.equal(s.login.sessionMethod(req), 'email');
  assert.equal((await s.request('/', { headers: req.headers })).status, 200);
});

test('owner email matching ignores case and surrounding whitespace', async t => {
  const s = await serve({ ownerEmail: '  OWNER@Example.Test  ',
    verifyAccess: async () => ({ email: '  Owner@EXAMPLE.test  ' }) }); t.after(s.close);
  const ok = await s.request('/auth/email', { headers: { 'cf-access-jwt-assertion': 'good' } });
  assert.match(session(ok), new RegExp(`^${COOKIE}=owner\\.`));
  const req = { headers: { cookie: session(ok) } };
  assert.equal(s.login.signedIn(req), true);
  assert.equal(s.login.isOwner(req), true);
  assert.equal(s.login.sessionMethod(req), 'owner');
});

test('passcode sessions never grant owner access', async t => {
  const s = await serve({ ownerEmail }); t.after(s.close);
  const ok = await s.enter('open sesame');
  assert.match(session(ok), new RegExp(`^${COOKIE}=passcode\\.`));
  const req = { headers: { cookie: session(ok) } };
  assert.equal(s.login.signedIn(req), true);
  assert.equal(s.login.isOwner(req), false);
  assert.equal(s.login.sessionMethod(req), s.login.signedIn(req) ? session(ok).split('=')[1].split('.')[0] : null);
});

test('changing an email cookie method to owner invalidates the session', async t => {
  const s = await serve(); t.after(s.close);
  const ok = await s.request('/auth/email', { headers: { 'cf-access-jwt-assertion': 'good' } });
  const cookie = session(ok).replace('=email.', '=owner.');
  const req = { headers: { cookie } };
  assert.equal(s.login.signedIn(req), false);
  assert.equal(s.login.isOwner(req), false);
  assert.equal(s.login.sessionMethod(req), s.login.signedIn(req) ? session(ok).split('=')[1].split('.')[0] : null);
  assert.equal((await s.request('/', { headers: req.headers })).status, 302);
});

test('without an owner email the matching email stays an ordinary session', async t => {
  const s = await serve(); t.after(s.close);
  const ok = await s.request('/auth/email', { headers: { 'cf-access-jwt-assertion': 'good' } });
  assert.match(session(ok), new RegExp(`^${COOKIE}=email\\.`));
  const req = { headers: { cookie: session(ok) } };
  assert.equal(s.login.signedIn(req), true);
  assert.equal(s.login.isOwner(req), false);
  assert.equal(s.login.sessionMethod(req), s.login.signedIn(req) ? session(ok).split('=')[1].split('.')[0] : null);
});

test('owner sessions expire after seven days', async t => {
  const s = await serve({ ownerEmail }); t.after(s.close);
  const ok = await s.request('/auth/email', { headers: { 'cf-access-jwt-assertion': 'good' } });
  const req = { headers: { cookie: session(ok) } };
  assert.equal(s.login.isOwner(req), true);
  assert.equal(s.login.sessionMethod(req), 'owner');
  s.advance(7 * 24 * 3600_000);
  assert.equal(s.login.signedIn(req), false);
  assert.equal(s.login.isOwner(req), false);
  assert.equal(s.login.sessionMethod(req), s.login.signedIn(req) ? session(ok).split('=')[1].split('.')[0] : null);
  assert.equal((await s.request('/', { headers: req.headers })).status, 302);
});

test('logout expires the app cookie and sessionMethod rejects missing and expired cookies', async t => {
  const s = await serve(); t.after(s.close);
  assert.equal(s.login.sessionMethod({ headers: {} }), null);
  const ok = await s.enter('open sesame');
  const req = { headers: { cookie: session(ok) } };
  assert.equal(s.login.sessionMethod(req), 'passcode');
  const response = await s.request('/logout', { headers: req.headers });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/auth');
  assert.equal(response.headers.get('set-cookie'), `${COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`);
  assert.equal(s.login.sessionMethod({ headers: { cookie: session(response) } }), null);
  s.advance(7 * 24 * 3600_000);
  assert.equal(s.login.sessionMethod(req), null);
});

test('unlisted and missing email claims cannot start a session and offer an Access logout link', async t => {
  for (const email of ['unlisted@example.test', '', undefined]) {
    const s = await serve({ ownerEmail, allowedEmails: () => [], verifyAccess: async () => ({ email }) }); t.after(s.close);
    const response = await s.request('/auth/email');
    assert.equal(response.status, 403); assert.equal(session(response), undefined);
    const html = await response.text();
    assert.match(html, /not on this app&#39;s sign-in list\. Ask the owner to add it\./);
    assert.match(html, /href="\/cdn-cgi\/access\/logout"/);
    if (email) assert.match(html, /unlisted@example\.test/);
  }
  const closed = await serve({ allowedEmails: undefined }); t.after(closed.close);
  assert.equal((await closed.request('/auth/email', { headers: { 'cf-access-jwt-assertion': 'good' } })).status, 403);
});

test('the denied email is escaped as text on the sign-in page', async t => {
  const email = `<img src=x onerror=alert(1)>&"'@example.test`;
  const s = await serve({ verifyAccess: async () => ({ email }) }); t.after(s.close);
  const response = await s.request('/auth/email');
  assert.equal(response.status, 403);
  const html = await response.text();
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;&amp;&quot;&#39;@example\.test/);
  assert(!html.includes(email)); assert(!html.includes('<img'));
});

test('removing a listed email immediately revokes its sessions but keeps owner and passcode sessions', async t => {
  const email = 'visitor@example.test';
  let emails = [email];
  const s = await serve({ ownerEmail, allowedEmails: () => emails,
    verifyAccess: async token => ({ email: token === 'owner' ? ownerEmail : email }) }); t.after(s.close);
  const byEmail = session(await s.request('/auth/email'));
  const byOwner = session(await s.request('/auth/email', { headers: { 'cf-access-jwt-assertion': 'owner' } }));
  const byPasscode = session(await s.enter('open sesame'));
  assert.equal((await s.request('/api/status', { headers: { cookie: byEmail } })).status, 200);
  emails = [];
  assert.equal((await s.request('/api/status', { headers: { cookie: byEmail } })).status, 401);
  assert.equal((await s.request('/', { headers: { cookie: byEmail } })).status, 302);
  assert.equal((await s.request('/auth/email')).status, 403);
  assert.equal((await s.request('/api/status', { headers: { cookie: byOwner } })).status, 200);
  assert.equal((await s.request('/api/status', { headers: { cookie: byPasscode } })).status, 200);
  assert.equal(s.login.isOwner({ headers: { cookie: byOwner } }), true);
});

test('email cookie signatures bind the address and strict parsing rejects malformed or legacy cookies', async t => {
  const email = 'first@example.test', other = 'second@example.test';
  const s = await serve({ allowedEmails: () => [email, other], verifyAccess: async () => ({ email }) }); t.after(s.close);
  const cookie = session(await s.request('/auth/email'));
  const [method, expires, address, signature] = cookie.split('=')[1].split('.');
  const legacySignature = createHmac('sha256', readFileSync(path.join(dir, 'secret'))).update(`email.${expires}.`).digest('base64url');
  const invalid = [
    cookie.replace(address, Buffer.from(other).toString('base64url')),
    cookie.replace(address, address + '='),
    `${cookie}.extra`, `${COOKIE}=${method}.${expires}.${signature}`,
    `${COOKIE}=email.${expires}.${legacySignature}`,
    `${COOKIE}=${method}.0${expires}.${address}.${signature}`,
    `${COOKIE}=${method}.${expires}.${address}.short`,
    `${COOKIE}=${method}.${expires}..${signature}`,
  ];
  for (const tampered of invalid) {
    assert.equal(s.login.sessionMethod({ headers: { cookie: tampered } }), null, tampered);
    assert.equal((await s.request('/api/status', { headers: { cookie: tampered } })).status, 401);
  }
});

test('existing three-part owner and passcode cookies retain their signing format', async t => {
  const s = await serve({ ownerEmail }); t.after(s.close);
  for (const response of [await s.enter('open sesame'), await s.request('/auth/email', { headers: { 'cf-access-jwt-assertion': 'good' } })]) {
    const cookie = session(response), parts = cookie.split('=')[1].split('.');
    assert.equal(parts.length, 3);
    assert.equal((await s.request('/api/status', { headers: { cookie } })).status, 200);
    assert.equal((await s.request('/api/status', { headers: { cookie: cookie + '.extra' } })).status, 401);
  }
});
