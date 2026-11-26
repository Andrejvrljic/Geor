// Kristallfabrik auf Cloudflare:
//   Worker        – liefert die Spielseite aus und beantwortet die API
//   Durable Object – Live-Raum (Multiplayer) über WebSocket
//   D1            – Konten, Fortschritt, Rangliste
import { Store, sameText } from './db.js';
import { computeScore, MODES } from '../public/shared/game.js';

const json = (status, data) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const SECURITY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'SAMEORIGIN',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; base-uri 'none'; form-action 'none'",
};

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL = 4 * 3600 * 1000;
const isRoomCode = (c) => typeof c === 'string' && /^[A-HJ-NP-Z2-9]{4}$/.test(c);
const newRoomCode = () => [...crypto.getRandomValues(new Uint8Array(4))].map((b) => ROOM_CHARS[b % ROOM_CHARS.length]).join('');

// kleine Bremse gegen Passwort-Raten (pro Worker-Instanz)
const fails = new Map();
function tooMany(key, limit = 10) {
  const now = Date.now(), f = fails.get(key);
  if (!f || now - f.t > 10 * 60_000) return false;
  return f.n >= limit;
}
function noteFail(key) {
  const now = Date.now(), f = fails.get(key);
  if (!f || now - f.t > 10 * 60_000) fails.set(key, { n: 1, t: now }); else f.n++;
  if (fails.size > 5000) fails.clear();
}

const num = (x, max) => Math.max(0, Math.min(max, Math.floor(Number(x) || 0)));
const text = (x, max) => (typeof x === 'string' ? x.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, max) : '');

function cleanRun(b) {
  const mode = MODES[b.mode] ? b.mode : null;
  if (!mode) return null;
  const r = {
    mode,
    timeMs: num(b.timeMs, 4 * 3600 * 1000),
    wrongChecks: num(b.wrongChecks, 999),
    hints: mode === 'C' ? num(b.hints, 6) : 0,
    tip: mode === 'A' && b.tip ? 1 : 0,
    kiCheck: mode === 'B' && ['ja', 'teilweise', 'nein'].includes(b.kiCheck) ? b.kiCheck : '',
    kiCheckWrong: mode === 'B' ? num(b.kiCheckWrong, 999) : 0,
    orderWrong: num(b.orderWrong, 999),
    packWrong: num(b.packWrong, 999),
    explain: text(b.explain, 600),
    room: isRoomCode(b.room) ? b.room : '',
  };
  if (r.timeMs < 5000) return null; // so schnell kann niemand spielen
  const s = computeScore(r);
  return { ...r, score: s.total, stars: s.stars, breakdown: s };
}

async function api(request, env, url) {
  const db = new Store(env.DB);
  const path = url.pathname;
  let body = {};
  if (request.method === 'POST') {
    const t = await request.text();
    if (t.length > 32 * 1024) return json(413, { error: 'Zu groß.' });
    try { body = JSON.parse(t || '{}') || {}; } catch { return json(400, { error: 'Ungültige Anfrage.' }); }
  }
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const ip = request.headers.get('cf-connecting-ip') || '?';
  const me = () => db.byToken(token);

  if (path === '/api/health') {
    let dbOk = false;
    try { dbOk = await db.ping(); } catch (e) { console.error(e); }
    return json(dbOk ? 200 : 503, { ok: dbOk, db: dbOk, version: env.VERSION || 'dev' });
  }
  if (path === '/api/signup' && request.method === 'POST') {
    if (tooMany('s' + ip, 80)) return json(429, { error: 'Zu viele neue Konten. Warte ein paar Minuten.' });
    const r = await db.signup(body.login, body.password);
    if (r.error) return json(400, { error: r.error });
    noteFail('s' + ip); // zählt Neuanmeldungen pro Netz (eine ganze Klasse teilt oft eine Adresse: max. 80 in 10 Minuten)
    return json(200, { token: r.token, login: r.login, progress: await db.progress(r.id) });
  }
  if (path === '/api/login' && request.method === 'POST') {
    const key = 'l' + ip + '|' + String(body.login || '').toLowerCase();
    if (tooMany(key)) return json(429, { error: 'Zu viele Fehlversuche. Warte 10 Minuten.' });
    const r = await db.login(body.login, body.password);
    if (!r) { noteFail(key); return json(401, { error: 'Spitzname oder Passwort stimmt nicht.' }); }
    return json(200, { token: r.token, login: r.login, progress: await db.progress(r.id) });
  }
  if (path === '/api/logout' && request.method === 'POST') { await db.logout(token); return json(200, { ok: true }); }
  if (path === '/api/me') {
    const a = await me();
    if (!a) return json(401, { error: 'Bitte melde dich an.' });
    return json(200, { login: a.login, progress: await db.progress(a.id) });
  }
  if (path === '/api/run' && request.method === 'POST') {
    const a = await me();
    if (!a) return json(401, { error: 'Bitte melde dich an.' });
    const r = cleanRun(body);
    if (!r) return json(400, { error: 'Ungültige Spielrunde.' });
    await db.addRun(a.id, r);
    return json(200, { score: r.breakdown, progress: await db.progress(a.id) });
  }
  if (path === '/api/leaderboard') {
    const mode = url.searchParams.get('mode');
    if (!MODES[mode]) return json(400, { error: 'Unbekannte Gruppe.' });
    return json(200, { mode, top: await db.leaderboard(mode) });
  }
  if (path === '/api/room' && request.method === 'POST') {
    const a = await me();
    if (!a) return json(401, { error: 'Bitte melde dich an.' });
    for (let i = 0; i < 8; i++) {
      const code = newRoomCode();
      const res = await env.ROOM.get(env.ROOM.idFromName(code)).fetch('https://room/init', {
        method: 'POST', body: JSON.stringify({ code, host: a.id }),
      });
      if (res.status === 200) return json(200, { code });
    }
    return json(503, { error: 'Kein freier Raum gefunden. Versuch es nochmal.' });
  }
  if (path === '/api/admin/results' && request.method === 'POST') {
    if (!env.ADMIN_CODE) return json(403, { error: 'Der Lehrkraft-Bereich ist gesperrt (Secret ADMIN_CODE fehlt).' });
    const key = 'a' + ip;
    if (tooMany(key)) return json(429, { error: 'Zu viele Fehlversuche. Warte 10 Minuten.' });
    if (typeof body.code !== 'string' || !sameText(body.code.trim(), env.ADMIN_CODE)) { noteFail(key); return json(403, { error: 'Falscher Code.' }); }
    return json(200, { runs: await db.allRuns() });
  }
  return json(404, { error: 'Nicht gefunden.' });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Nur WebSocket', { status: 426 });
      const code = (url.searchParams.get('room') || '').toUpperCase();
      if (!isRoomCode(code)) return new Response('Unbekannter Raum', { status: 400 });
      return env.ROOM.get(env.ROOM.idFromName(code)).fetch(request);
    }
    if (url.pathname.startsWith('/api/')) {
      try { return await api(request, env, url); } catch (e) { console.error(e); return json(500, { error: 'Serverfehler' }); }
    }
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
    return out;
  },
};

// ===== Live-Raum: alle Spielenden mit demselben Code sehen sich gegenseitig live =====
export class RoomDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.meta = null;            // { code, host, created }
    this.phase = 'lobby';        // lobby | running
    this.startAt = 0;
    this.players = new Map();    // accountId -> { id, name, mode, stage, score, stars, done, conns:Set }
    this.timer = 0;
    state.blockConcurrencyWhile(async () => { this.meta = (await state.storage.get('meta')) || null; });
  }

  alive() { return this.meta && Date.now() - this.meta.created < ROOM_TTL; }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') {
      if (this.alive()) return new Response('besetzt', { status: 409 });
      const b = await request.json();
      this.meta = { code: b.code, host: b.host, created: Date.now() };
      this.phase = 'lobby'; this.startAt = 0; this.players.clear();
      await this.state.storage.put('meta', this.meta);
      return new Response('ok');
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Nur WebSocket', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const conn = { ws: server, player: null, n: 0, t: Date.now() };
    const send = (m) => { try { server.send(JSON.stringify(m)); } catch { /* weg */ } };
    conn.send = send;
    server.addEventListener('message', (e) => {
      const now = Date.now();
      if (now - conn.t > 1000) { conn.t = now; conn.n = 0; }
      if (++conn.n > 20) return; // Flut bremsen
      let m; try { m = JSON.parse(typeof e.data === 'string' ? e.data : ''); } catch { return; }
      this.onMessage(conn, m).catch((err) => { console.error(err); send({ t: 'error', msg: 'Serverfehler' }); });
    });
    const bye = () => {
      if (conn.player) { conn.player.conns.delete(conn); this.broadcastSoon(); }
      conn.player = null;
    };
    server.addEventListener('close', bye);
    server.addEventListener('error', bye);
    return new Response(null, { status: 101, webSocket: client });
  }

  async onMessage(conn, m) {
    const send = conn.send;
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'ping') return send({ t: 'pong' });
    if (m.t === 'hello') {
      if (!this.alive()) return send({ t: 'error', msg: 'Diesen Raum gibt es nicht (mehr). Prüfe den Code.', fatal: true });
      const acc = await new Store(this.env.DB).byToken(m.token);
      if (!acc) return send({ t: 'error', msg: 'Bitte melde dich an, bevor du einem Raum beitrittst.', fatal: true });
      let p = this.players.get(acc.id);
      if (!p) {
        if (this.players.size >= 80) return send({ t: 'error', msg: 'Der Raum ist voll.', fatal: true });
        p = { id: acc.id, name: acc.login, mode: '', stage: 0, score: 0, stars: 0, done: false, conns: new Set() };
        this.players.set(acc.id, p);
      }
      if (conn.player && conn.player !== p) conn.player.conns.delete(conn);
      conn.player = p; p.conns.add(conn);
      send({ t: 'welcome', you: p.id, host: p.id === this.meta.host, code: this.meta.code });
      return this.broadcast();
    }
    const p = conn.player;
    if (!p) return send({ t: 'error', msg: 'Erst „hello“ senden.' });
    const isHost = p.id === this.meta.host;
    if (m.t === 'mode') {
      if (!MODES[m.mode]) return;
      if (p.stage > 0 && !p.done) return send({ t: 'error', msg: 'Während des Spiels kannst du die Gruppe nicht wechseln.' });
      p.mode = m.mode; return this.broadcastSoon();
    }
    if (m.t === 'progress') {
      if (!MODES[p.mode]) return;
      p.stage = num(m.stage, 4);
      if (m.done) { p.done = true; p.stage = 4; p.score = num(m.score, 2000); p.stars = num(m.stars, 3); }
      return this.broadcastSoon();
    }
    if (m.t === 'start') {
      if (!isHost) return send({ t: 'error', msg: 'Nur die Spielleitung kann starten.' });
      this.phase = 'running'; this.startAt = Date.now() + 3000;
      for (const q of this.players.values()) { q.stage = 0; q.score = 0; q.stars = 0; q.done = false; }
      this.sendAll({ t: 'start', at: this.startAt });
      return this.broadcast();
    }
    if (m.t === 'reset') {
      if (!isHost) return send({ t: 'error', msg: 'Nur die Spielleitung kann zurücksetzen.' });
      this.phase = 'lobby'; this.startAt = 0;
      for (const q of this.players.values()) { q.stage = 0; q.score = 0; q.stars = 0; q.done = false; }
      this.sendAll({ t: 'reset' });
      return this.broadcast();
    }
  }

  snapshot() {
    const players = [...this.players.values()]
      .filter((p) => p.conns.size || p.mode)
      .map((p) => ({ id: p.id, name: p.name, mode: p.mode, stage: p.stage, score: p.score, stars: p.stars, done: p.done, online: p.conns.size > 0, host: p.id === this.meta.host }))
      .sort((a, b) => (b.done - a.done) || (b.score - a.score) || (b.stage - a.stage) || a.name.localeCompare(b.name));
    return { t: 'room', code: this.meta.code, phase: this.phase, startAt: this.startAt, players };
  }
  sendAll(m) {
    const s = JSON.stringify(m);
    for (const p of this.players.values()) for (const c of p.conns) { try { c.ws.send(s); } catch { /* weg */ } }
  }
  broadcast() { clearTimeout(this.timer); this.timer = 0; if (this.meta) this.sendAll(this.snapshot()); }
  broadcastSoon() { if (!this.timer) this.timer = setTimeout(() => this.broadcast(), 150); }
}
