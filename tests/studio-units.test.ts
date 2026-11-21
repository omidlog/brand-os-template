import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RateLimiter } from '../apps/studio/src/auth/rate-limit.js'
import { base32Encode, totpAt, TotpVerifier } from '../apps/studio/src/auth/totp.js'
import { first, parseCookies, parseForm, safeLocalPath, serializeCookie } from '../apps/studio/src/http.js'
import { catalog, i18n, isLocale, LOCALES, type MessageKey } from '../apps/studio/src/i18n/index.js'
import { Client, OWNER_LOGIN, OWNER_PASSWORD, startStudio, TOTP_SECRET } from './helpers/studio-server.js'

/** Small Studio modules that had no direct tests: the TOTP verifier's results, the rate limiter, HTTP helpers and the message catalogs. */

test('TOTP check tells a reused code apart from a wrong one', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'))
  const verifier = new TotpVerifier(secret)
  const now = 1_700_000_000_000
  const code = totpAt(secret, now)
  assert.equal(verifier.check('abc', now), 'invalid')
  assert.equal(verifier.check(code === '000000' ? '111111' : '000000', now), 'invalid')
  assert.equal(verifier.check(code, now), 'ok')
  assert.equal(verifier.check(code, now), 'reused')
  // Still reused in the next step (accepted through the drift window), and verify() stays a boolean view.
  assert.equal(verifier.check(code, now + 30_000), 'reused')
  assert.equal(verifier.verify(code, now), false)
  // A fresh code from the next step is fine.
  assert.equal(verifier.check(totpAt(secret, now + 60_000), now + 60_000), 'ok')
})

test('rate limiter: fixed window, blocked() does not count, reset clears', () => {
  let clock = 0
  const limiter = new RateLimiter(2, 1_000, () => clock)
  assert.deepEqual(limiter.take('a'), { ok: true, retryAfterSeconds: 0 })
  assert.equal(limiter.blocked('a'), false)
  assert.equal(limiter.take('a').ok, true)
  assert.equal(limiter.blocked('a'), true)
  clock = 400
  assert.deepEqual(limiter.take('a'), { ok: false, retryAfterSeconds: 1 })
  assert.equal(limiter.blocked('b'), false, 'keys are independent')
  clock = 1_000
  assert.equal(limiter.blocked('a'), false, 'the window has passed')
  assert.equal(limiter.take('a').ok, true)
  limiter.take('a')
  limiter.reset('a')
  assert.equal(limiter.blocked('a'), false)
})

test('HTTP helpers: forms, cookies and local redirect targets', () => {
  const form = parseForm(Buffer.from('a=1&a=2&b=x%20y&__proto__=bad&constructor=bad'))
  assert.deepEqual(form.a, ['1', '2'])
  assert.equal(form.b, 'x y')
  assert.equal(Object.hasOwn(form, '__proto__'), false)
  assert.equal(Object.hasOwn(form, 'constructor'), false)
  assert.equal(first(['x', 'y']), 'x')
  assert.equal(first(undefined), '')
  assert.deepEqual(parseCookies('a=1; b=%20two; a=ignored; =x; bad=%E0%A4%A'), { a: '1', b: ' two' })
  assert.deepEqual(parseCookies(undefined), {})
  assert.equal(serializeCookie('s', 'v w', { secure: true, maxAgeSeconds: 60 }), 's=v%20w; Path=/; SameSite=Strict; HttpOnly; Secure; Max-Age=60')
  assert.equal(serializeCookie('s', 'v', { secure: false, httpOnly: false }), 's=v; Path=/; SameSite=Strict')
  assert.equal(safeLocalPath('/brands/acme', '/x'), '/brands/acme')
  for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', 'brands', '/a\r\nSet-Cookie: x', `/${'a'.repeat(400)}`, undefined, '']) {
    assert.equal(safeLocalPath(bad, '/x'), '/x', String(bad))
  }
})

test('message catalogs: every locale has every key, the same placeholders, and real translations', () => {
  const en = catalog('en')
  const keys = Object.keys(en) as MessageKey[]
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
  for (const locale of LOCALES) {
    const messages = catalog(locale)
    assert.deepEqual(Object.keys(messages).sort(), [...keys].sort(), `${locale} has the same keys as en`)
    for (const key of keys) {
      assert.ok(messages[key].trim().length > 0, `${locale}:${key} is not empty`)
      assert.deepEqual(placeholders(messages[key]), placeholders(en[key]), `${locale}:${key} keeps the placeholders of en`)
    }
  }
  // Persian is right-to-left and actually translated; Turkish is translated too, not a copy of English.
  assert.equal(i18n('fa').dir, 'rtl')
  assert.equal(i18n('en').dir, 'ltr')
  assert.equal(i18n('tr').dir, 'ltr')
  assert.match(catalog('fa')['login.title'], /[؀-ۿ]/)
  assert.notEqual(catalog('tr')['login.title'], en['login.title'])
  assert.equal(isLocale('fa'), true)
  assert.equal(isLocale('de'), false)
  // Variables are filled in; unknown ones are left visible rather than silently dropped.
  assert.equal(i18n('en').t('login.rateLimited', { minutes: 15 }), 'Too many attempts. Try again in about 15 minutes.')
  assert.match(i18n('en').t('login.rateLimited'), /\{minutes\}/)
})

test('signing in again with an authentication code that was already used says to wait for a new code', async () => {
  const s = await startStudio()
  try {
    const code = totpAt(TOTP_SECRET, Date.now())
    const client = new Client(s.url)
    const token = await client.csrf('/login')
    const ok = await client.request('POST', '/login', { form: { _csrf: token, login: OWNER_LOGIN, password: OWNER_PASSWORD, totp: code } })
    assert.equal(ok.status, 303)
    const again = new Client(s.url)
    const token2 = await again.csrf('/login')
    const reused = await again.request('POST', '/login', { form: { _csrf: token2, login: OWNER_LOGIN, password: OWNER_PASSWORD, totp: code } })
    assert.equal(reused.status, 401)
    const text = await reused.text()
    assert.match(text, /already used/)
    assert.match(text, /Wait for a new code/)
    assert.equal(again.cookies.has('studio_session'), false)
    // A plainly wrong code keeps the generic message.
    const token3 = await again.csrf('/login')
    const wrong = await again.request('POST', '/login', { form: { _csrf: token3, login: OWNER_LOGIN, password: OWNER_PASSWORD, totp: '12345x' } })
    assert.equal(wrong.status, 401)
    const wrongText = await wrong.text()
    assert.match(wrongText, /Sign-in failed/)
    assert.doesNotMatch(wrongText, /already used/)
  } finally {
    await s.close()
  }
})
