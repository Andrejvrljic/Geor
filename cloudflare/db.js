// D1-Datenbank: Konten, Spielrunden (Fortschritt) und Rangliste.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, login TEXT NOT NULL UNIQUE COLLATE NOCASE, pass TEXT NOT NULL,
    created INTEGER NOT NULL, last_seen INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, account_id INTEGER NOT NULL, created INTEGER NOT NULL, last_used INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, mode TEXT NOT NULL, score INTEGER NOT NULL,
    stars INTEGER NOT NULL, time_ms INTEGER NOT NULL, wrong_checks INTEGER NOT NULL, hints INTEGER NOT NULL,
    tip INTEGER NOT NULL, ki_check TEXT NOT NULL, ki_wrong INTEGER NOT NULL, order_wrong INTEGER NOT NULL,
    pack_wrong INTEGER NOT NULL, explain TEXT NOT NULL, room TEXT NOT NULL, played INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id)',
  'CREATE INDEX IF NOT EXISTS idx_runs_account ON runs(account_id, mode)',
  'CREATE INDEX IF NOT EXISTS idx_runs_mode_score ON runs(mode, score DESC)',
];

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
export const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

async function pbkdf2(pw, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256));
}
export function sameText(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
async function hashPassword(pw) { const salt = randomHex(16); return `pbkdf2$${salt}$${await pbkdf2(pw, salt)}`; }
async function verifyPassword(pw, stored) {
  const [kind, salt, hash] = String(stored || '').split('$');
  if (kind !== 'pbkdf2' || !salt || !hash) return false;
  return sameText(await pbkdf2(pw, salt), hash);
}

export function checkLogin(login, password) {
  if (typeof login !== 'string' || !/^[A-Za-z0-9_äöüÄÖÜß.-]{3,20}$/.test(login)) return 'Spitzname: 3–20 Zeichen (Buchstaben, Zahlen, _ . -).';
  if (typeof password !== 'string' || password.length < 6 || password.length > 100) return 'Passwort: mindestens 6 Zeichen.';
  return null;
}

let schemaReady = null;

export class Store {
  constructor(d1) { this.d1 = d1; }
  async ready() {
    if (!schemaReady) schemaReady = this.d1.batch(SCHEMA.map((s) => this.d1.prepare(s))).catch((e) => { schemaReady = null; throw e; });
    await schemaReady;
  }
  async q(sql, ...args) { await this.ready(); return this.d1.prepare(sql).bind(...args); }

  async ping() { return (await (await this.q('SELECT COUNT(*) AS n FROM accounts')).first()).n >= 0; }

  async signup(login, password) {
    const err = checkLogin(login, password);
    if (err) return { error: err };
    if (await (await this.q('SELECT id FROM accounts WHERE login = ?', login)).first()) return { error: 'Diesen Spitznamen gibt es schon. Nimm einen anderen.' };
    const now = Date.now();
    try {
      const r = await (await this.q('INSERT INTO accounts (login, pass, created, last_seen) VALUES (?, ?, ?, ?)', login, await hashPassword(password), now, now)).run();
      const id = r.meta.last_row_id;
      return { id, login, token: await this.newSession(id) };
    } catch { return { error: 'Diesen Spitznamen gibt es schon. Nimm einen anderen.' }; }
  }

  async login(login, password) {
    if (typeof login !== 'string' || typeof password !== 'string' || login.length > 40 || password.length > 100) return null;
    const a = await (await this.q('SELECT id, login, pass FROM accounts WHERE login = ?', login)).first();
    if (!a || !(await verifyPassword(password, a.pass))) return null;
    return { id: a.id, login: a.login, token: await this.newSession(a.id) };
  }

  async newSession(id) {
    const token = randomHex(24), now = Date.now();
    await (await this.q('INSERT INTO sessions (token_hash, account_id, created, last_used) VALUES (?, ?, ?, ?)', await sha(token), id, now, now)).run();
    return token;
  }

  async byToken(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const h = await sha(token);
    const a = await (await this.q('SELECT a.id, a.login, s.last_used FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ?', h)).first();
    if (!a) return null;
    const now = Date.now();
    if (now - a.last_used > 60_000) {
      await this.d1.batch([
        this.d1.prepare('UPDATE sessions SET last_used = ? WHERE token_hash = ?').bind(now, h),
        this.d1.prepare('UPDATE accounts SET last_seen = ? WHERE id = ?').bind(now, a.id),
      ]);
    }
    return { id: a.id, login: a.login };
  }

  async logout(token) { if (typeof token === 'string') await (await this.q('DELETE FROM sessions WHERE token_hash = ?', await sha(token))).run(); }

  async addRun(accountId, r) {
    const res = await (await this.q(`INSERT INTO runs (account_id, mode, score, stars, time_ms, wrong_checks, hints, tip, ki_check, ki_wrong,
      order_wrong, pack_wrong, explain, room, played) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    accountId, r.mode, r.score, r.stars, r.timeMs, r.wrongChecks, r.hints, r.tip, r.kiCheck, r.kiCheckWrong,
    r.orderWrong, r.packWrong, r.explain, r.room, Date.now())).run();
    return res.meta.last_row_id;
  }

  async progress(accountId) {
    const { results } = await (await this.q(`SELECT mode, COUNT(*) AS plays, MAX(score) AS best, MAX(stars) AS stars, MIN(time_ms) AS fastest
      FROM runs WHERE account_id = ? GROUP BY mode`, accountId)).all();
    const out = {};
    for (const m of ['A', 'B', 'C']) out[m] = { plays: 0, best: 0, stars: 0, fastest: 0 };
    for (const r of results) out[r.mode] = { plays: r.plays, best: r.best, stars: r.stars, fastest: r.fastest };
    return out;
  }

  async leaderboard(mode, limit = 20) {
    const { results } = await (await this.q(`SELECT a.login, MAX(r.score) AS best, MIN(r.time_ms) AS fastest, COUNT(*) AS plays
      FROM runs r JOIN accounts a ON a.id = r.account_id WHERE r.mode = ? GROUP BY r.account_id
      ORDER BY best DESC, fastest ASC LIMIT ?`, mode, limit)).all();
    return results;
  }

  async allRuns(limit = 2000) {
    const { results } = await (await this.q(`SELECT r.*, a.login FROM runs r JOIN accounts a ON a.id = r.account_id
      ORDER BY r.played DESC LIMIT ?`, limit)).all();
    return results;
  }
}
