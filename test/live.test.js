// Live-Test gegen einen laufenden Server: TEST_URL=https://kristallfabrik.<subdomain>.workers.dev npm run test:live
// Prüft Seite, Datenbank (Konten, Fortschritt, Rangliste) und Multiplayer (Live-Raum über WebSocket).
// Testkonten beginnen mit „kftest“ und werden nach dem Live-Test vom Workflow wieder gelöscht.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

const base = (process.env.TEST_URL || '').replace(/\/$/, '');
if (!base) throw new Error('TEST_URL fehlt, z. B. TEST_URL=http://127.0.0.1:8787');
const wsBase = base.replace(/^http/, 'ws');

const rnd = () => Math.random().toString(36).slice(2, 9);
async function api(method, url, body, token) {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
async function signup() {
  const login = 'kftest' + rnd();
  const r = await api('POST', '/api/signup', { login, password: 'geheim123' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return { login, token: r.data.token };
}

const sockets = [];
after(() => { for (const s of sockets) { try { s.close(); } catch { /* egal */ } } });
async function socket(room) {
  const ws = new WebSocket(`${wsBase}/ws?room=${room}`);
  sockets.push(ws);
  const msgs = [], waiters = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data); msgs.push(m);
    for (const w of [...waiters]) if (w.fn(m)) { waiters.splice(waiters.indexOf(w), 1); msgs.splice(msgs.indexOf(m), 1); w.ok(m); }
  });
  await new Promise((ok, fail) => { ws.addEventListener('open', ok); ws.addEventListener('error', () => fail(new Error('WebSocket-Fehler'))); });
  return {
    send: (m) => ws.send(JSON.stringify(m)),
    wait: (fn, ms = 8000) => new Promise((ok, fail) => {
      const hit = msgs.find(fn);
      if (hit) { msgs.splice(msgs.indexOf(hit), 1); return ok(hit); }
      const w = { fn, ok: (m) => { clearTimeout(t); ok(m); } };
      const t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); fail(new Error('Zeitüberschreitung beim Warten auf eine Nachricht')); }, ms);
      waiters.push(w);
    }),
    close: () => ws.close(),
  };
}

test('Spielseite wird ausgeliefert', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Kristallfabrik/);
  assert.match(res.headers.get('content-security-policy') || '', /default-src 'self'/);
  for (const f of ['/app.js', '/style.css', '/shared/game.js']) assert.equal((await fetch(base + f)).status, 200, f);
});

test('Gesundheit: Datenbank erreichbar', async () => {
  const r = await api('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.db, true);
});

test('Konten: anlegen, doppelt, falsches Passwort, anmelden, abmelden', async () => {
  const a = await signup();
  assert.equal((await api('POST', '/api/signup', { login: a.login, password: 'geheim123' })).status, 400);
  assert.equal((await api('POST', '/api/signup', { login: 'x', password: 'geheim123' })).status, 400);
  assert.equal((await api('POST', '/api/login', { login: a.login, password: 'falsch!!' })).status, 401);
  const l = await api('POST', '/api/login', { login: a.login.toUpperCase(), password: 'geheim123' });
  assert.equal(l.status, 200);
  const me = await api('GET', '/api/me', null, l.data.token);
  assert.equal(me.status, 200);
  assert.equal(me.data.login, a.login);
  assert.deepEqual(Object.keys(me.data.progress).sort(), ['A', 'B', 'C']);
  assert.equal((await api('POST', '/api/logout', {}, l.data.token)).status, 200);
  assert.equal((await api('GET', '/api/me', null, l.data.token)).status, 401);
  assert.equal((await api('GET', '/api/me', null, a.token)).status, 200);
});

test('Fortschritt und Rangliste: Server rechnet die Punkte selbst', async () => {
  const a = await signup();
  assert.equal((await api('POST', '/api/run', { mode: 'A', timeMs: 60000 })).status, 401);
  assert.equal((await api('POST', '/api/run', { mode: 'X', timeMs: 60000 }, a.token)).status, 400);
  assert.equal((await api('POST', '/api/run', { mode: 'A', timeMs: 10 }, a.token)).status, 400);
  // hints zählen in Gruppe A nicht, score vom Client wird ignoriert
  const r = await api('POST', '/api/run', { mode: 'A', timeMs: 300000, wrongChecks: 1, hints: 5, tip: true, orderWrong: 0, packWrong: 2, score: 99999, explain: 'Kiste 3 halbieren' }, a.token);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.score.s1, 400 - 40 - 30);
  assert.equal(r.data.score.s3, 200);
  assert.equal(r.data.progress.A.plays, 1);
  assert.equal(r.data.progress.A.best, r.data.score.total);
  const c = await api('POST', '/api/run', { mode: 'C', timeMs: 100000, hints: 2 }, a.token);
  assert.equal(c.data.score.s1, 340);
  const top = await api('GET', '/api/leaderboard?mode=A');
  assert.equal(top.status, 200);
  assert.ok(Array.isArray(top.data.top));
  assert.equal((await api('GET', '/api/leaderboard?mode=Z')).status, 400);
});

test('Lehrkraft-Bereich ist geschützt', async () => {
  const r = await api('POST', '/api/admin/results', { code: 'sicher-falsch-' + rnd() });
  assert.equal(r.status, 403);
});

test('Multiplayer: Live-Raum erstellen, beitreten, starten, Fortschritt sehen', async () => {
  const host = await signup(), kid = await signup();
  assert.equal((await api('POST', '/api/room', {})).status, 401);
  const room = await api('POST', '/api/room', {}, host.token);
  assert.equal(room.status, 200);
  const code = room.data.code;
  assert.match(code, /^[A-Z2-9]{4}$/);

  // ohne Anmeldung kein Zutritt
  const anon = await socket(code);
  anon.send({ t: 'hello', token: 'kaputt' });
  assert.match((await anon.wait((m) => m.t === 'error')).msg, /melde dich an/);
  anon.close();

  const h = await socket(code);
  h.send({ t: 'hello', token: host.token });
  const w1 = await h.wait((m) => m.t === 'welcome');
  assert.equal(w1.host, true);

  const k = await socket(code);
  k.send({ t: 'hello', token: kid.token });
  assert.equal((await k.wait((m) => m.t === 'welcome')).host, false);
  await h.wait((m) => m.t === 'room' && m.players.some((p) => p.name === kid.login));

  k.send({ t: 'mode', mode: 'B' });
  await h.wait((m) => m.t === 'room' && m.players.some((p) => p.name === kid.login && p.mode === 'B'));

  k.send({ t: 'start' });
  assert.match((await k.wait((m) => m.t === 'error')).msg, /Spielleitung/);

  h.send({ t: 'start' });
  const s1 = await h.wait((m) => m.t === 'start'), s2 = await k.wait((m) => m.t === 'start');
  assert.equal(s1.at, s2.at);
  await h.wait((m) => m.t === 'room' && m.phase === 'running');

  k.send({ t: 'progress', stage: 2 });
  await h.wait((m) => m.t === 'room' && m.players.some((p) => p.name === kid.login && p.stage === 2));
  k.send({ t: 'progress', stage: 3, done: true, score: 930, stars: 3 });
  const fin = await h.wait((m) => m.t === 'room' && m.players.some((p) => p.name === kid.login && p.done));
  const me = fin.players.find((p) => p.name === kid.login);
  assert.equal(me.score, 930);
  assert.equal(fin.players[0].name, kid.login); // Fertige stehen oben

  h.send({ t: 'reset' });
  await k.wait((m) => m.t === 'reset');
  h.close(); k.close();

  const bad = await socket('ZZZZ');
  bad.send({ t: 'hello', token: host.token });
  assert.match((await bad.wait((m) => m.t === 'error')).msg, /gibt es nicht/);
  bad.close();
});
