import express from 'express';
import { PAGE_PATHS } from '../shared/page-routes.mjs';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// Sign-in for the public host. Cloudflare Access proves an email address with
// its one-time PIN at /auth/email; this app's owner and stored sign-in list
// decide who gets an app session. Visitors can also use the shared passcode.
export const COOKIE = '__Host-critter_session';
const SESSION_MS = 7 * 24 * 3600_000; // Matches the Access session length.
const SESSION_METHODS = ['passcode', 'email', 'owner'];
const FAILURES_PER_IP = 10, FAILURES_TOTAL = 100, FAILURE_WINDOW_MS = 15 * 60_000;

export function createLogin({ publicOrigin, passcode, verifyAccess, secretFile, ownerEmail, allowedEmails = () => [], now = () => Date.now() }) {
  const secret = loadSecret(secretFile);
  const passcodeHash = passcode ? sha256(passcode) : null;
  // A blank owner address configures nobody as owner; an empty claim must never match it.
  const ownerAddress = String(ownerEmail ?? '').trim().toLowerCase();
  // Bind passcode sessions to the passcode and email sessions to the proved address.
  const sign = (method, expires, address = '') => createHmac('sha256', secret)
    .update(`${method}.${expires}.${method === 'passcode' ? passcodeHash?.toString('hex') : address}`).digest('base64url');
  const failures = [];

  function sessionMethod(req) {
    const session = parseSession(cookies(req.headers.cookie)[COOKIE], now());
    if (!session) return null;
    const { method, expires, signature, address, email } = session;
    if (method === 'passcode' && !passcodeHash) return null;
    if (!safeEqual(Buffer.from(signature), Buffer.from(sign(method, expires, address)))) return null;
    if (method === 'email' && !allowedEmails().includes(email)) return null;
    return method;
  }
  function signedIn(req) { return sessionMethod(req) !== null; }
  function isOwner(req) { return sessionMethod(req) === 'owner'; }
  function startSession(res, method, email = '') {
    const expires = now() + SESSION_MS;
    const address = method === 'email' ? Buffer.from(email).toString('base64url') : '';
    const value = `${method}.${expires}.${address ? `${address}.` : ''}${sign(method, expires, address)}`;
    res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/; Max-Age=${SESSION_MS / 1000}; HttpOnly; Secure; SameSite=Lax`);
    res.redirect(303, '/');
  }
  // Pages get the sign-in form; API calls get a JSON error the frontend can show.
  function challenge(req, res) {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.redirect(302, '/auth');
    res.status(401).json({ error: 'Your sign-in has expired. Reload the page to sign in again.' });
  }
  function tooManyFailures(ip) {
    const cutoff = now() - FAILURE_WINDOW_MS;
    while (failures.length && failures[0].at < cutoff) failures.shift();
    return failures.length >= FAILURES_TOTAL || failures.filter(f => f.ip === ip).length >= FAILURES_PER_IP;
  }

  const router = express.Router();
  router.get('/auth', (req, res) => signedIn(req) ? res.redirect(302, '/') : page(res, 200, { passcode: Boolean(passcodeHash) }));
  router.post('/auth/passcode', express.urlencoded({ extended: false, limit: '2kb' }), (req, res) => {
    // Browsers send Origin on form posts; requiring it blocks cross-site login forms.
    if (req.headers.origin !== publicOrigin.origin) return res.status(403).json({ error: 'Cross-origin access denied.' });
    if (!passcodeHash) return page(res, 404, { passcode: false });
    const ip = req.headers['cf-connecting-ip'] || req.socket.remoteAddress;
    if (tooManyFailures(ip)) return page(res, 429, { passcode: true, error: 'Too many wrong passcodes. Try again in 15 minutes.' });
    if (typeof req.body?.passcode === 'string' && safeEqual(sha256(req.body.passcode.trim()), passcodeHash)) return startSession(res, 'passcode');
    failures.push({ ip, at: now() });
    page(res, 401, { passcode: true, error: 'That passcode is not right.' });
  });
  // Access proves the address; membership is checked here and again on each email session request.
  router.get('/auth/email', async (req, res) => {
    let claims;
    try { claims = await verifyAccess(req.headers['cf-access-jwt-assertion']); } catch {
      return page(res, 403, { passcode: Boolean(passcodeHash), error: 'Email sign-in did not go through. Try again.' });
    }
    const claimEmail = String(claims?.email ?? '').trim().toLowerCase();
    const method = ownerAddress && claimEmail === ownerAddress ? 'owner' : 'email';
    if (method === 'email' && (!claimEmail || !allowedEmails().includes(claimEmail))) return page(res, 403, {
      passcode: Boolean(passcodeHash), accessLogout: true,
      error: `${claimEmail || 'This email address'} is not on this app's sign-in list. Ask the owner to add it.`,
    });
    console.log(`email sign-in: ${method} session`);
    startSession(res, method, claimEmail);
  });

  router.get(PAGE_PATHS.logout, (_req, res) => logout(res, '/auth'));

  return { signedIn, sessionMethod, isOwner, challenge, router };
}

export function logout(res, target) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`);
  res.redirect(303, target);
}

function parseSession(value, now) {
  const parts = value?.split('.') || [], [method, expires] = parts;
  if (!SESSION_METHODS.includes(method) || parts.length !== (method === 'email' ? 4 : 3)) return null;
  if (!/^[1-9]\d*$/.test(expires) || !Number.isSafeInteger(Number(expires)) || Number(expires) <= now) return null;
  const signature = parts.at(-1), address = method === 'email' ? parts[2] : '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  let email = '';
  if (method === 'email') {
    if (!/^[A-Za-z0-9_-]+$/.test(address)) return null;
    email = Buffer.from(address, 'base64url').toString('utf8');
    if (Buffer.from(email).toString('base64url') !== address) return null;
  }
  return { method, expires, signature, address, email };
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function page(res, status, { passcode, error, accessLogout = false }) {
  // Under the app-wide no-referrer policy, browsers post this form with "Origin: null".
  res.setHeader('Referrer-Policy', 'same-origin');
  res.status(status).type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Critter Generator</title>
<style>
/* Static hex mirrors of the plum tokens in src/style.css (dark theme); this page runs no script. */
:root{color-scheme:dark;--bg:#16121b;--surface:#241f2b;--subtle:#2c2534;--border:#847c8e;--text:#eceaf0;--muted:#aea8b5;--accent:#af7cc6;--on-accent:#1b121f;--danger:#ff9088}
/* Same browser-relative text-scale knob as src/style.css. */
html{font-size:120%}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:0.9375rem/1.6 Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{width:min(340px,100% - 32px)}
h1{font:400 1.875rem/1.2 Georgia,serif;margin:0 0 24px}
label{display:block;font-size:0.8125rem;font-weight:600;margin-bottom:8px}
input{box-sizing:border-box;width:100%;padding:11px 12px;font:inherit;border:1px solid var(--border);background:var(--subtle);border-radius:8px;color:inherit}
button{margin-top:14px;width:100%;padding:12px;font:inherit;font-weight:600;border:0;border-radius:8px;background:var(--accent);color:var(--on-accent);cursor:pointer}
button:hover{filter:brightness(1.08)}
input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
p{margin:16px 0 0;font-size:0.8125rem;color:var(--muted)}a{color:var(--accent)}
.error{color:var(--danger)}
</style></head><body><main>
<h1>Critter Generator</h1>
${passcode ? `<form method="post" action="/auth/passcode">
<label for="passcode">Passcode</label>
<input id="passcode" name="passcode" type="password" autocomplete="current-password" required autofocus>
<button type="submit">Enter</button>
</form>` : ''}
${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
${accessLogout ? '<p><a href="/cdn-cgi/access/logout">Sign out of email to try another address</a></p>' : ''}
<p><a href="/auth/email">${passcode ? 'Sign in with email instead' : 'Sign in with email'}</a></p>
</main></body></html>`);
}

function loadSecret(file) {
  if (existsSync(file)) return readFileSync(file);
  const secret = randomBytes(32);
  writeFileSync(file, secret, { mode: 0o600, flag: 'wx' });
  return secret;
}
function cookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => part.trim()).filter(part => part.includes('='))
    .map(part => [part.slice(0, part.indexOf('=')), part.slice(part.indexOf('=') + 1)]));
}
const sha256 = value => createHash('sha256').update(value).digest();
const safeEqual = (a, b) => a.length === b.length && timingSafeEqual(a, b);
