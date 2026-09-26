/** Checks POST /api/captcha/new and POST /api/captcha/claim with a real token. */
const BASE = 'http://localhost:5173/api'; // through the Vite proxy, as the browser does
const out = [];
const log = (...a) => out.push(a.join(' '));

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = {};
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

(async () => {
  const email = `btn_${Date.now()}@t.com`;
  const reg = await call('/auth/register', { method: 'POST', body: { name: 'Btn', email, password: 'secret123' } });
  log('register ->', reg.status, 'balance=', reg.body.balance);
  const token = reg.body.token;

  const a = await call('/captcha/current', { token });
  log('current  ->', a.status, 'code=', a.body.challenge && a.body.challenge.captchaText);

  const b = await call('/captcha/new', { method: 'POST', token });
  log('new #1   ->', b.status, 'code=', b.body.challenge && b.body.challenge.captchaText);

  const c = await call('/captcha/new', { method: 'POST', token });
  log('new #2   ->', c.status, 'code=', c.body.challenge && c.body.challenge.captchaText);
  log('codes differ =', a.body.challenge.challengeId !== b.body.challenge.challengeId);

  // now verify + claim
  const ch = c.body.challenge;
  await new Promise(r => setTimeout(r, 500));
  const v = await call('/captcha/verify', {
    method: 'POST', token,
    body: { challengeId: ch.challengeId, selectedOption: ch.captchaText, signature: ch.signature }
  });
  log('verify   ->', v.status, 'result=', v.body.result, 'rewardStatus=', v.body.reward && v.body.reward.status);
  log('balance after verify (should be unchanged 125.5) =', v.body.newBalance);

  const cl = await call('/captcha/claim', { method: 'POST', token, body: { challengeId: ch.challengeId } });
  log('claim    ->', cl.status, 'newBalance=', cl.body.newBalance);

  const cl2 = await call('/captcha/claim', { method: 'POST', token, body: { challengeId: ch.challengeId } });
  log('claim x2 ->', cl2.status, cl2.body.code);

  const gems = await call('/wallet/gems', { token });
  log('gems     ->', gems.status, 'balance=', gems.body.balance);

  console.log(out.join('\n'));
})().catch(e => console.log('ERROR ' + e.message + '\n' + out.join('\n')));
