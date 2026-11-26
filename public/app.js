// Kristallfabrik – KI-Lernlabor als Spiel (Browser-Teil)
import {
  VALUES, CRATES, PACK, MODES, TIP_A, SOLUTION_B, COACH_C, STEPS, REAL_STEPS,
  checkCode, checkPack, canPlace, computeScore,
} from './shared/game.js';

/* ---------- kleine Helfer ---------- */
const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v; // nur für eigene, feste Texte – nie für Eingaben
    else if (k === 'style') e.setAttribute('style', v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const fmtTime = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* privat */ } },
};
const sess = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* privat */ } },
};

function toast(msg) {
  let w = $('.toastWrap'); if (!w) { w = h('div', { class: 'toastWrap', role: 'status', 'aria-live': 'polite' }); document.body.append(w); }
  const t = h('div', { class: 'toast' }, msg); w.append(t); setTimeout(() => t.remove(), 3100);
}
function modal(build) {
  const bg = h('div', { class: 'modalBg' }), box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }); bg.append(box);
  const close = () => bg.remove();
  bg.addEventListener('pointerdown', (e) => { if (e.target === bg) close(); });
  build(box, close); document.body.append(bg);
  const f = box.querySelector('input,button'); if (f) setTimeout(() => f.focus(), 30);
  return close;
}
function confirmBox(title, text, yes, onYes, no = 'Abbrechen') {
  modal((b, close) => b.append(h('h2', {}, title), h('p', {}, text),
    h('div', { class: 'row end' }, h('button', { class: 'btn light', onclick: close }, no), h('button', { class: 'btn', onclick: () => { close(); onYes(); } }, yes))));
}
function noPaste(el) {
  el.addEventListener('paste', (e) => { e.preventDefault(); toast('✋ Hier bitte in eigenen Worten schreiben – Einfügen ist ausgeschaltet.'); });
  el.addEventListener('drop', (e) => e.preventDefault());
  return el;
}
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cols = ['#e8483a', '#2d7fe8', '#1fa774', '#f5b800', '#7b4fe0', '#f07a12'];
  for (let i = 0; i < 70; i++) {
    const c = h('div', { class: 'confetti', style: `left:${Math.random() * 100}vw;background:${cols[i % cols.length]};animation-duration:${1.6 + Math.random() * 1.8}s;animation-delay:${Math.random() * .4}s` });
    document.body.append(c); setTimeout(() => c.remove(), 4200);
  }
}

const GEM = { R: { c: '#e8483a', d: '#a8281c', n: 'Rot' }, B: { c: '#2d7fe8', d: '#1d4fb0', n: 'Blau' }, G: { c: '#1fa774', d: '#11734f', n: 'Grün' } };
const gemSVG = (k) => { const g = GEM[k]; return `<svg viewBox="0 0 40 40" role="img" aria-label="${g.n}"><polygon points="20,3 35,14 29,37 11,37 5,14" fill="${g.c}" stroke="${g.d}" stroke-width="2"/><polygon points="20,3 26,14 20,37 14,14" fill="rgba(255,255,255,.28)"/><polygon points="5,14 35,14 20,3" fill="rgba(255,255,255,.35)"/><text x="20" y="28" text-anchor="middle" font-size="13" font-weight="900" fill="#fff" font-family="system-ui">${k}</text></svg>`; };
const gem = (k) => h('span', { class: 'gem', html: gemSVG(k) });
const starsEl = (n, cls = 'stars') => h('span', { class: cls, 'aria-label': `${n} von 3 Sternen` }, ...[1, 2, 3].map((i) => h('span', { class: i <= n ? '' : 'off' }, '★')));

/* ---------- Zustand & API ---------- */
const S = { auth: store.get('kf_auth'), progress: null, room: null, game: null };

async function api(method, path, body) {
  try {
    const res = await fetch(path, {
      method, headers: { 'content-type': 'application/json', ...(S.auth ? { authorization: 'Bearer ' + S.auth.token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {}; try { data = await res.json(); } catch { /* leer */ }
    return { status: res.status, data };
  } catch { return { status: 0, data: { error: 'Keine Verbindung zum Server.' } }; }
}
function setAuth(a) { S.auth = a ? { token: a.token, login: a.login } : null; store.set('kf_auth', S.auth); if (a && a.progress) S.progress = a.progress; if (!a) S.progress = null; }

function setTheme(mode) {
  const m = MODES[mode], r = document.documentElement.style;
  r.setProperty('--acc', m ? m.color : '#2d6fe0'); r.setProperty('--acc2', m ? m.dark : '#1d4fb0'); r.setProperty('--accSoft', m ? m.soft : '#e6eeff');
  const tc = $('meta[name="theme-color"]'); if (tc) tc.content = m ? m.color : '#2d6fe0';
}

/* ---------- Gerüst ---------- */
function shell({ logo = '💎', title = 'Kristallfabrik', sub = 'KI-Lernlabor · Knacke die Geheimcodes', right = [] } = {}) {
  const app = $('#app'); app.innerHTML = '';
  const userBtn = S.auth
    ? h('button', { class: 'pill', onclick: accountMenu, title: 'Konto' }, '👤 ', S.auth.login)
    : h('button', { class: 'pill', onclick: () => loginModal(() => renderHome()) }, '🔑 Anmelden');
  app.append(h('header', { class: 'top' },
    h('div', { class: 'brand' }, h('span', { class: 'logo' }, logo), h('div', {}, h('div', { class: 't' }, title), h('div', { class: 's' }, sub))),
    ...right, userBtn));
  const main = h('main', { class: 'wrap' }); app.append(main);
  window.scrollTo(0, 0);
  return main;
}
function accountMenu() {
  modal((b, close) => b.append(h('h2', {}, '👤 ' + S.auth.login),
    h('p', { class: 'muted' }, 'Du bist angemeldet. Deine Punkte werden gespeichert und erscheinen in der Rangliste.'),
    h('div', { class: 'row end' }, h('button', { class: 'btn light', onclick: close }, 'Schließen'),
      h('button', { class: 'btn', onclick: async () => { await api('POST', '/api/logout'); leaveRoom(); setAuth(null); close(); toast('Abgemeldet.'); renderHome(); } }, 'Abmelden'))));
}

function loginModal(onDone, { guest = null } = {}) {
  modal((b, close) => {
    let mode = 'login';
    const login = h('input', { class: 'field', placeholder: 'Spitzname', autocomplete: 'username', maxlength: 20 });
    const pass = h('input', { class: 'field', type: 'password', placeholder: 'Passwort (mind. 6 Zeichen)', autocomplete: 'current-password', maxlength: 100 });
    const err = h('div', { class: 'errNote hidden', role: 'alert' });
    const t1 = h('button', { class: 'tab on' }, 'Anmelden'), t2 = h('button', { class: 'tab' }, 'Neues Konto');
    const go = h('button', { class: 'btn', type: 'submit' }, 'Anmelden');
    const setMode = (m) => { mode = m; t1.classList.toggle('on', m === 'login'); t2.classList.toggle('on', m === 'signup'); go.textContent = m === 'login' ? 'Anmelden' : 'Konto anlegen'; pass.autocomplete = m === 'login' ? 'current-password' : 'new-password'; err.classList.add('hidden'); };
    t1.onclick = () => setMode('login'); t2.onclick = () => setMode('signup');
    const form = h('form', { onsubmit: async (e) => {
      e.preventDefault(); go.disabled = true;
      const r = await api('POST', mode === 'login' ? '/api/login' : '/api/signup', { login: login.value.trim(), password: pass.value });
      go.disabled = false;
      if (r.status !== 200) { err.textContent = r.data.error || 'Das hat nicht geklappt.'; err.classList.remove('hidden'); return; }
      setAuth(r.data); close(); toast(mode === 'login' ? `Willkommen zurück, ${r.data.login}!` : `Konto angelegt. Hallo ${r.data.login}!`); onDone && onDone();
    } },
    h('label', { class: 'lbl' }, 'Spitzname'), login, h('label', { class: 'lbl' }, 'Passwort'), pass,
    h('p', { class: 'muted small' }, '🔐 Nimm einen Spitznamen, nicht deinen echten Namen. Merk dir dein Passwort gut.'),
    err, h('div', { class: 'row end', style: 'margin-top:10px' }, h('button', { class: 'btn light', type: 'button', onclick: close }, 'Abbrechen'), go));
    b.append(h('h2', {}, '🔑 Anmelden'), h('div', { class: 'tabs' }, t1, t2), form);
    if (guest) b.append(h('div', { style: 'text-align:center;margin-top:12px' }, h('button', { class: 'linkBtn', onclick: () => { close(); guest(); } }, 'Ohne Konto spielen (Punkte werden nicht gespeichert)')));
  });
}

/* ---------- Startseite: Gruppe wählen ---------- */
async function renderHome() {
  S.game = null; setTheme(null);
  const main = shell();
  main.append(h('div', { class: 'card hero' },
    h('h1', {}, '💎 Die Geheimcodes der Kristallfabrik'),
    h('p', { style: 'margin:6px auto 0;max-width:640px' }, 'Rot, Blau und Grün haben jeweils einen geheimen Wert. Knacke den Code in drei kurzen Levels – in ca. 5 Minuten. ',
      h('b', {}, 'Wähle zuerst, wie du spielen willst:'))));
  const grid = h('div', { class: 'modes' });
  for (const m of Object.values(MODES)) {
    const p = S.progress && S.progress[m.key];
    grid.append(h('section', { class: 'mode', style: `--mc:${m.color};--md:${m.dark};--ms:${m.soft}` },
      h('div', { class: 'mh' }, h('span', { class: 'mi', 'aria-hidden': 'true' }, m.icon), h('div', {}, h('div', { class: 'ml' }, 'Gruppe ' + m.key), h('h2', {}, m.name))),
      h('div', { class: 'sub' }, m.sub + ' · ca. 5 Minuten'),
      h('div', { class: 'mis', html: '<b>Deine Mission:</b> ' + m.mission }),
      h('ul', {}, m.rules.map((r) => h('li', { html: r }))),
      p && p.plays ? h('div', { class: 'best' }, 'Bestwert: ', h('b', {}, p.best), ' ', starsEl(p.stars), ` · ${p.plays}× gespielt`) : null,
      h('button', { class: 'btn big', onclick: () => play(m.key) }, `▶ ${m.icon} Als ${m.name.replace('Die ', '')} spielen`)));
  }
  main.append(grid);

  const code = h('input', { class: 'field', placeholder: 'Raum-Code', maxlength: 4, style: 'max-width:150px;text-transform:uppercase;font-weight:900;letter-spacing:3px', autocomplete: 'off' });
  const join = () => { const c = code.value.trim().toUpperCase(); if (!/^[A-Z0-9]{4}$/.test(c)) return toast('Der Raum-Code hat 4 Zeichen.'); needAccount(() => enterRoom(c)); };
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  main.append(h('div', { class: 'card' },
    h('h3', {}, '🏁 Live-Raum – mit der ganzen Klasse gleichzeitig'),
    h('p', { class: 'muted', style: 'margin:0 0 10px' }, 'Die Lehrkraft erstellt einen Raum und sagt den Code. Alle sehen live, wer in welchem Level ist – und wer zuerst fertig ist.'),
    h('div', { class: 'row' }, code, h('button', { class: 'btn', onclick: join }, 'Beitreten')),
    h('div', { style: 'margin-top:10px' }, h('button', { class: 'linkBtn', style: 'padding-left:0', onclick: teacherRoomModal }, '👩‍🏫 Raum erstellen (nur für Lehrkräfte)'))));
  main.append(h('div', { class: 'row center' },
    h('button', { class: 'btn gold', onclick: () => renderLeaderboard('A') }, '🏆 Rangliste')));
  main.append(h('div', { class: 'footer' }, h('button', { class: 'linkBtn', onclick: renderTeacher }, '👩‍🏫 Lehrkraft-Ansicht')));

  if (S.auth) {
    const r = await api('GET', '/api/me');
    if (r.status === 401) { setAuth(null); toast('Bitte melde dich neu an.'); return renderHome(); }
    if (r.status === 200 && !S.game && JSON.stringify(r.data.progress) !== JSON.stringify(S.progress)) { S.progress = r.data.progress; if ($('.modes')) renderHome(); }
  }
}
function needAccount(fn) { if (S.auth) fn(); else loginModal(fn); }
function play(mode, room = null) {
  if (S.auth) return startGame(mode, room);
  loginModal(() => startGame(mode, room), { guest: room ? null : () => startGame(mode, null) });
}

/* ---------- Das Spiel ---------- */
function startGame(mode, room) {
  setTheme(mode);
  S.game = {
    mode, room, t0: Date.now(), stage: 1,
    values: { R: '', B: '', G: '' }, solved: false, wrongChecks: 0,
    tip: false, hints: 0, kiSteps: 0, kiVerified: [false, false, false], kiCheckWrong: 0,
    placed: [], orderWrong: 0, explain: '', pack: [], packWrong: 0, packOk: false, deck: shuffle(STEPS.map((s) => s.id)),
  };
  sendProgress();
  renderStage();
}
function gameShell() {
  const g = S.game, m = MODES[g.mode];
  const timer = h('span', { class: 'pill', id: 'timer' }, '⏱ ' + fmtTime(Date.now() - g.t0));
  const quit = h('button', { class: 'pill', title: 'Spiel abbrechen', 'aria-label': 'Spiel abbrechen', onclick: () => confirmBox('Spiel abbrechen?', 'Dein Fortschritt in dieser Runde geht verloren.', 'Abbrechen', () => { S.game = null; S.room ? renderRoom() : renderHome(); }, 'Weiterspielen') }, '✕');
  const main = shell({ logo: m.icon, title: `Gruppe ${m.key} – ${m.name}`, sub: m.sub, right: [timer, quit] });
  const labels = ['1 · Code knacken', '2 · Denkweg', '3 · Packung'];
  main.append(h('div', { class: 'stagebar' }, labels.map((l, i) => h('span', { class: i + 1 === g.stage ? 'on' : i + 1 < g.stage ? 'done' : '' }, i + 1 < g.stage ? '✔ ' + l.slice(4) : l))));
  if (S.room) main.append(liveStrip());
  return main;
}
setInterval(() => { const t = $('#timer'); if (t && S.game && !S.game.over) t.textContent = '⏱ ' + fmtTime(Date.now() - S.game.t0); }, 1000);

function renderStage() {
  const g = S.game;
  if (g.stage === 1) return stage1();
  if (g.stage === 2) return stage2();
  if (g.stage === 3) return stage3();
}
function nextStage() { S.game.stage++; sendProgress(); renderStage(); }

function cratesCard() {
  const badges = {};
  const box = h('div', { class: 'card' }, h('h3', {}, '💎 Die drei Geheimcodes'),
    ...CRATES.map((c) => {
      const res = h('span', { class: 'res' });
      const row = h('div', { class: 'crate' }, h('span', { class: 'cn' }, 'Kiste ' + c.n),
        ...c.items.flatMap((k, i) => [i ? h('span', { class: 'plus' }, '+') : null, gem(k)]), h('span', { class: 'eq' }, '= ' + c.sum), res);
      badges[c.n] = { row, res };
      return row;
    }),
    h('div', { class: 'legend' }, h('span', {}, 'R = Rot'), h('span', {}, 'B = Blau'), h('span', {}, 'G = Grün'), h('span', { class: 'muted' }, 'Jede Farbe hat immer denselben Wert.')));
  box.mark = (result) => {
    for (const c of result.crates) {
      const b = badges[c.n]; b.row.classList.toggle('ok', c.state === 'ok'); b.row.classList.toggle('bad', c.state !== 'ok');
      b.res.textContent = c.state === 'ok' ? `✓ ${c.sum}` : `${c.sum} · ${c.state === 'hoch' ? 'zu viel' : 'zu wenig'}`;
    }
  };
  return box;
}

/* Level 1: Code knacken */
function stage1() {
  const g = S.game, main = gameShell();
  const crates = cratesCard();
  main.append(crates);
  const help = g.mode === 'A' ? helpA() : g.mode === 'B' ? helpB() : helpC();
  main.append(help);

  // Code-Schloss
  const feedback = h('div', { 'aria-live': 'polite' });
  const lock = h('div', { class: 'lock' });
  const inputs = {};
  for (const k of ['R', 'B', 'G']) {
    const inp = h('input', { inputmode: 'numeric', 'aria-label': GEM[k].n + ' Wert', value: g.values[k], maxlength: 2, placeholder: '?' });
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 2); g.values[k] = inp.value; });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
    const step = (d) => { if (g.solved) return; const v = Math.max(0, Math.min(30, (parseInt(inp.value, 10) || 0) + d)); inp.value = String(v); g.values[k] = inp.value; };
    inputs[k] = inp;
    lock.append(h('div', { class: 'dial' }, gem(k), h('span', { class: 'nm' }, GEM[k].n),
      h('div', { class: 'ctl' }, h('button', { 'aria-label': GEM[k].n + ' minus', onclick: () => step(-1) }, '−'), inp, h('button', { 'aria-label': GEM[k].n + ' plus', onclick: () => step(1) }, '+'))));
  }
  const checkBtn = h('button', { class: 'btn big', onclick: () => check() }, '🔓 Code prüfen');
  function check() {
    if (g.solved) return;
    if (['R', 'B', 'G'].some((k) => g.values[k] === '')) return toast('Trag zuerst alle drei Werte ein.');
    const res = checkCode(g.values);
    crates.mark(res);
    feedback.innerHTML = '';
    if (res.solved) {
      g.solved = true; lock.classList.add('win'); checkBtn.classList.add('hidden');
      Object.values(inputs).forEach((i) => { i.disabled = true; });
      if (g.mode === 'B') g.kiCheck = ['nein', 'teilweise', 'teilweise', 'ja'][g.kiVerified.filter(Boolean).length];
      confetti();
      feedback.append(h('div', { class: 'okNote', style: 'margin-top:12px' }, '🎉 Code geknackt! Alle drei Kisten stimmen.',
        h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn green big', onclick: nextStage }, 'Weiter zu Level 2 →'))));
      return;
    }
    g.wrongChecks++;
    const bad = res.crates.find((c) => c.state !== 'ok');
    feedback.append(h('div', { class: 'errNote', style: 'margin-top:12px' },
      g.mode === 'B' ? 'Noch nicht. Vergleiche deine Werte nochmal genau mit der Lösung des KI-Roboters.'
        : 'Noch nicht. Schau dir die rot markierten Kisten an: Welcher Wert ist zu groß oder zu klein?'));
    if (g.mode === 'C' && help.say) help.say(`Kiste ${bad.n} ist ${bad.state === 'hoch' ? 'zu groß' : 'zu klein'}. Welche Farbe kommt in Kiste ${bad.n} besonders oft vor – und könnte ihr Wert ${bad.state === 'hoch' ? 'kleiner' : 'größer'} sein?`);
  }
  main.append(h('div', { class: 'card' }, h('h3', {}, h('span', { class: 'num' }, '🔒'), 'Das Code-Schloss'),
    h('p', { class: 'muted', style: 'margin:0 0 10px' }, 'Stell die Werte ein und drück „Code prüfen“. Jeder falsche Versuch kostet Punkte – also erst denken, dann prüfen!'),
    lock, h('div', { class: 'row', style: 'margin-top:12px' }, checkBtn), feedback));
  main.append(scratchCard());
}

function helpA() {
  const g = S.game;
  const tip = h('div', { class: 'mission', style: 'margin-top:10px', html: '💡 <b>Tipp zum Selberdenken:</b> ' + TIP_A });
  const btn = h('button', { class: 'btn light sm', style: 'margin-top:10px', onclick: () => { g.tip = true; btn.remove(); card.append(tip); } }, '💡 Tipp anzeigen (−30 Punkte)');
  const card = h('div', { class: 'card' }, h('h3', {}, h('span', { class: 'num' }, '1'), 'Knacke den Code – ganz allein'),
    h('p', { style: 'margin:0' }, 'Finde die Werte selbst. Probiere systematisch, vergleiche die Kisten und prüfe deine Vermutung. Nutze den Schmierzettel unten.'));
  card.append(g.tip ? tip : btn);
  return card;
}

function bot(av, html, step) {
  return h('div', { class: 'msg' }, h('span', { class: 'av', 'aria-hidden': 'true' }, av), h('div', { class: 'bub' }, step ? h('span', { class: 'step' }, step) : null, h('span', { html })));
}
function meMsg(text) { return h('div', { class: 'msg me' }, h('span', { class: 'av', 'aria-hidden': 'true' }, '🙂'), h('div', { class: 'bub' }, text)); }
function typing(av) { return h('div', { class: 'msg' }, h('span', { class: 'av' }, av), h('div', { class: 'bub' }, h('span', { class: 'typing', 'aria-label': 'schreibt' }, h('i'), h('i'), h('i')))); }
function botSay(chat, av, html, step, ms = 650) {
  return new Promise((ok) => { const t = typing(av); chat.append(t); setTimeout(() => { const el = bot(av, html, step); t.replaceWith(el); ok(el); }, ms); });
}

function helpB() {
  const g = S.game;
  const chat = h('div', { class: 'chat' }, bot('🤖', 'Hallo! Ich bin der <b>KI-Roboter</b>. Ich kann dir die <b>vollständige Lösung</b> der drei Geheimcodes zeigen – Schritt für Schritt. Lies jeden Schritt genau!'));
  const ctl = h('div', { class: 'row' });
  const verify = h('div');
  const card = h('div', { class: 'card' }, h('h3', {}, h('span', { class: 'num' }, '1'), '🤖 Der KI-Roboter'), chat, ctl, verify);
  const showVerify = () => {
    verify.innerHTML = '';
    verify.append(h('div', { class: 'note', style: 'margin:12px 0 10px' }, '✅ Prüfe die KI selbst! Rechne mit Rot = 5, Blau = 3, Grün = 7 jede Kiste nach. Stimmt die Summe?'));
    CRATES.forEach((c, i) => {
      const inp = h('input', { inputmode: 'numeric', maxlength: 3, 'aria-label': `Summe Kiste ${c.n}` });
      const row = h('div', { class: 'verify' + (g.kiVerified[i] ? ' ok' : '') }, h('b', {}, `Kiste ${c.n}:`), h('span', {}, c.items.map((k) => VALUES[k]).join(' + ') + ' ='));
      const ok = () => { row.classList.add('ok'); row.lastChild.replaceWith(h('b', { style: 'color:var(--good)' }, `${c.sum} ✓ stimmt`)); };
      const btn = h('button', { class: 'btn sm', onclick: () => {
        if (inp.value === '') return toast('Rechne zuerst und trag die Summe ein.');
        if (Number(inp.value) === crateSumOf(c)) { g.kiVerified[i] = true; inp.disabled = true; btn.remove(); ok(); } else { g.kiCheckWrong++; toast('Rechne nochmal nach!'); }
      } }, 'Prüfen');
      row.append(inp, btn);
      if (g.kiVerified[i]) { inp.remove(); btn.remove(); row.append(h('span')); ok(); }
      verify.append(row);
    });
    verify.append(h('p', { class: 'muted small' }, 'Danach trägst du die Werte unten ins Code-Schloss ein.'));
  };
  const next = async () => {
    ctl.innerHTML = '';
    await botSay(chat, '🤖', SOLUTION_B[g.kiSteps], `Schritt ${g.kiSteps + 1} von ${SOLUTION_B.length}`);
    g.kiSteps++;
    if (g.kiSteps < SOLUTION_B.length) ctl.append(h('button', { class: 'btn sm', onclick: next }, 'Nächster Schritt ▸'));
    else showVerify();
  };
  // Wiederaufbau (z. B. nach Neuzeichnen)
  if (g.kiSteps === 0) {
    ctl.append(h('button', { class: 'btn', onclick: () => { chat.append(meMsg('Löse alle drei Geheimcodes vollständig und erkläre deinen Denkweg Schritt für Schritt.')); next(); } }, '🤖 Vollständige Lösung anfordern'));
  } else {
    for (let i = 0; i < g.kiSteps; i++) chat.append(bot('🤖', SOLUTION_B[i], `Schritt ${i + 1} von ${SOLUTION_B.length}`));
    if (g.kiSteps < SOLUTION_B.length) ctl.append(h('button', { class: 'btn sm', onclick: next }, 'Nächster Schritt ▸')); else showVerify();
  }
  return card;
}
const crateSumOf = (c) => c.items.reduce((s, k) => s + VALUES[k], 0);

function helpC() {
  const g = S.game;
  const chat = h('div', { class: 'chat' }, bot('🧭', 'Hallo, ich bin dein <b>KI-Coach</b>. Ich verrate dir <b>keine Kristallwerte</b> – aber ich stelle dir Fragen, die dir beim Denken helfen. Hol dir einen Denkanstoß, wenn du nicht weiterkommst.'));
  const ctl = h('div', { class: 'row' });
  const card = h('div', { class: 'card' }, h('h3', {}, h('span', { class: 'num' }, '1'), '🧭 Der KI-Coach'), chat, ctl);
  card.say = (text) => botSay(chat, '🧭', '', null, 500).then((el) => { el.querySelector('.bub span:last-child').textContent = text; });
  const ask = async () => {
    if (g.hints >= COACH_C.length) return;
    const c = COACH_C[g.hints]; g.hints++;
    drawCtl();
    const said = await botSay(chat, '🧭', c.q, `Denkanstoß ${g.hints}`);
    if (c.choices) {
      const box = h('div', { class: 'answer' });
      c.choices.forEach((ch) => box.append(h('button', { class: 'btn light sm', onclick: () => {
        chat.append(meMsg(ch));
        if (ch === c.correct) { box.remove(); botSay(chat, '🧭', c.yes); } else botSay(chat, '🧭', c.no);
      } }, ch)));
      said.querySelector('.bub').append(box);
    } else if (c.answer != null) {
      const inp = h('input', { inputmode: 'numeric', maxlength: 3, 'aria-label': 'Deine Antwort' });
      const send = () => {
        if (inp.value === '') return;
        chat.append(meMsg(inp.value));
        if (Number(inp.value) === c.answer) { box.remove(); botSay(chat, '🧭', c.yes); } else { inp.value = ''; botSay(chat, '🧭', c.no); }
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      const box = h('div', { class: 'answer' }, inp, h('button', { class: 'btn sm', onclick: send }, 'Antworten'));
      said.querySelector('.bub').append(box);
    }
  };
  const drawCtl = () => {
    ctl.innerHTML = '';
    if (g.hints < COACH_C.length) ctl.append(h('button', { class: 'btn', onclick: ask }, `💬 Denkanstoß holen (−30 Punkte) · ${COACH_C.length - g.hints} übrig`));
    else ctl.append(h('span', { class: 'muted' }, 'Keine weiteren Denkanstöße – du schaffst das!'));
  };
  for (let i = 0; i < g.hints; i++) chat.append(bot('🧭', COACH_C[i].q, `Denkanstoß ${i + 1}`));
  drawCtl();
  return card;
}

/* Level 2: Denkweg-Puzzle */
function stage2() {
  const g = S.game, main = gameShell();
  if (g.mode === 'B') main.append(h('div', { class: 'note', style: 'margin-bottom:16px' }, '🤖 Die Lösung des KI-Roboters ist jetzt zugeklappt. Zeig, was du dir gemerkt hast!'));
  const path = h('div', { class: 'path', 'aria-live': 'polite' });
  const deck = h('div', { class: 'steps' });
  const msg = h('div', { 'aria-live': 'polite' });
  const after = h('div');
  const drawPath = () => {
    path.innerHTML = '';
    if (!g.placed.length) path.append(h('span', { class: 'muted' }, 'Hier entsteht dein Denkweg. Tippe unten auf den ersten Schritt.'));
    g.placed.forEach((id, i) => path.append(h('div', { class: 'pi' }, h('span', { class: 'num' }, String(i + 1)), STEPS.find((s) => s.id === id).text)));
  };
  const drawDeck = () => {
    deck.innerHTML = '';
    const done = g.placed.length >= REAL_STEPS;
    for (const id of g.deck) {
      if (g.placed.includes(id)) continue;
      const s = STEPS.find((x) => x.id === id);
      if (done) { deck.append(h('div', { class: 'okNote' }, '🪤 Falle erkannt: „' + s.text + '“ hilft nicht weiter – in den Kisten liegen ja verschiedene Kristalle.')); continue; }
      const b = h('button', { class: 'sCard', onclick: () => {
        if (canPlace(id, g.placed)) { g.placed.push(id); msg.innerHTML = ''; drawPath(); drawDeck(); if (g.placed.length >= REAL_STEPS) finishOrder(); return; }
        g.orderWrong++;
        b.classList.remove('wrong'); void b.offsetWidth; b.classList.add('wrong');
        msg.innerHTML = '';
        msg.append(h('div', { class: 'errNote', style: 'margin-top:10px' }, s.need === null ? 'Das hilft nicht weiter: Wenn man alle Kisten zusammenzählt, weiß man trotzdem nicht, was ein einzelner Kristall wert ist.' : 'Noch nicht! Was musst du vorher schon wissen, damit dieser Schritt klappt?'));
      } }, s.text);
      deck.append(b);
    }
  };
  const finishOrder = () => {
    confetti();
    const ta = noPaste(h('textarea', { class: 'field', maxlength: 600, placeholder: 'z. B. Zuerst habe ich … weil …' }));
    ta.value = g.explain; ta.addEventListener('input', () => { g.explain = ta.value; });
    after.innerHTML = '';
    after.append(h('div', { class: 'okNote', style: 'margin-top:12px' }, '🎉 Super – dein Denkweg ist vollständig!'),
      h('label', { class: 'lbl' }, '✍️ In eigenen Worten (freiwillig): Was ist der Trick bei den Geheimcodes?'), ta,
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn green big', onclick: nextStage }, 'Weiter zu Level 3 →')));
  };
  main.append(h('div', { class: 'card' }, h('h3', {}, h('span', { class: 'num' }, '2'), 'Der Denkweg'),
    h('p', { style: 'margin:0 0 10px' }, 'Wie knackt man den Code? Tippe die Schritte in einer sinnvollen Reihenfolge an. ', h('b', {}, 'Vorsicht: Eine Karte ist eine Falle!')),
    path, h('h4', { style: 'margin:14px 0 8px' }, 'Schritt-Karten'), deck, msg, after));
  drawPath(); drawDeck();
  if (g.placed.length >= REAL_STEPS) finishOrder();
}

/* Level 3: Kristall-Packung */
function stage3() {
  const g = S.game, main = gameShell();
  const tray = h('div', { class: 'tray' }), cnt = h('span', { class: 'counter' }), msg = h('div', { 'aria-live': 'polite' });
  const draw = () => {
    tray.innerHTML = '';
    if (!g.pack.length) tray.append(h('span', { class: 'muted' }, 'Tippe unten auf die Kristalle, um deine Packung zu füllen.'));
    g.pack.forEach((k, i) => tray.append(h('button', { class: 'gemBtn gem', title: 'Entfernen', 'aria-label': GEM[k].n + ' entfernen', html: gemSVG(k), onclick: () => { if (g.packOk) return; g.pack.splice(i, 1); draw(); } })));
    cnt.textContent = `${g.pack.length} von ${PACK.size} Kristallen`;
    cnt.style.color = g.pack.length === PACK.size ? 'var(--good)' : '';
  };
  const adders = h('div', { class: 'row', style: 'margin-top:10px' }, ...['R', 'B', 'G'].map((k) => h('button', { class: 'btn light', onclick: () => {
    if (g.packOk) return;
    if (g.pack.length >= PACK.size) return toast('Genau fünf Kristalle! Tippe einen Kristall in der Packung an, um ihn zu entfernen.');
    g.pack.push(k); g.pack.sort((a, b) => 'RBG'.indexOf(a) - 'RBG'.indexOf(b)); draw();
  } }, gem(k), '+ ' + GEM[k].n)), cnt);
  const checkBtn = h('button', { class: 'btn big', onclick: () => {
    const r = checkPack(g.pack);
    msg.innerHTML = '';
    if (r.why === 'anzahl') return toast(`Genau ${PACK.size} Kristalle – du hast ${r.count}.`);
    if (r.why === 'farbe') return toast('Von jeder Farbe muss mindestens einer dabei sein!');
    if (!r.ok) { g.packWrong++; msg.append(h('div', { class: 'errNote', style: 'margin-top:12px' }, `Noch nicht – deine Packung ist ${r.why === 'hoch' ? 'zu viel' : 'zu wenig'} wert. Rechne mit deinen Werten nach und tausche einen Kristall.`)); return; }
    g.packOk = true; checkBtn.remove(); adders.remove(); confetti();
    msg.append(h('div', { class: 'okNote', style: 'margin-top:12px' }, '🎉 Perfekt gepackt! ', h('b', {}, g.pack.map((k) => VALUES[k]).join(' + ') + ` = ${PACK.sum} ✓`),
      h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn green big', onclick: finish }, '🏁 Fertig – Ergebnis ansehen'))));
  } }, '📦 Packung prüfen');
  main.append(h('div', { class: 'card' }, h('h3', {}, h('span', { class: 'num' }, '3'), 'Die Kristall-Packung'),
    h('p', { style: 'margin:0 0 10px' }, `Der Chef der Kristallfabrik braucht eine Packung mit genau ${PACK.size} Kristallen, die zusammen ${PACK.sum} wert sind. Von jeder Farbe muss mindestens einer dabei sein.`),
    h('div', { class: 'row', style: 'margin-bottom:10px;gap:14px' }, h('b', {}, 'Deine Werte:'), ...['R', 'B', 'G'].map((k) => h('span', { class: 'row', style: 'gap:4px' }, gem(k), h('b', {}, '= ' + VALUES[k])))),
    tray, adders, h('div', { class: 'row', style: 'margin-top:12px' }, checkBtn), msg));
  draw();
  main.append(scratchCard());
}

/* Ergebnis */
async function finish() {
  const g = S.game; g.over = true;
  const metrics = {
    mode: g.mode, timeMs: Date.now() - g.t0, wrongChecks: g.wrongChecks, hints: g.hints, tip: g.tip,
    kiCheck: g.kiCheck || '', kiCheckWrong: g.kiCheckWrong, orderWrong: g.orderWrong, packWrong: g.packWrong, explain: g.explain, room: g.room || '',
  };
  const sc = computeScore(metrics);
  sendProgress({ done: true, score: sc.total, stars: sc.stars });
  const before = S.progress && S.progress[g.mode] ? S.progress[g.mode].best : 0;
  const m = MODES[g.mode];
  const main = shell({ logo: m.icon, title: `Gruppe ${m.key} – ${m.name}`, sub: 'Ergebnis', right: [h('span', { class: 'pill' }, '⏱ ' + fmtTime(metrics.timeMs))] });
  if (S.room) main.append(liveStrip());
  const saved = h('div', { style: 'margin-top:12px' });
  const det1 = g.mode === 'A' ? `${g.wrongChecks} Fehlversuche · Tipp ${g.tip ? 'benutzt' : 'nicht benutzt'}`
    : g.mode === 'B' ? `${g.wrongChecks} Fehlversuche · KI selbst geprüft: ${g.kiCheck || 'nein'}${g.kiCheckWrong ? ` (${g.kiCheckWrong}× verrechnet)` : ''}`
      : `${g.wrongChecks} Fehlversuche · ${g.hints} Denkanstöße`;
  main.append(h('div', { class: 'card hero' },
    h('div', { class: 'heroIcon' }, sc.stars === 3 ? '🏆' : sc.stars === 2 ? '🥈' : '🎖️'),
    h('h1', {}, sc.stars === 3 ? 'Meisterhaft geknackt!' : sc.stars === 2 ? 'Stark gemacht!' : 'Geschafft!'),
    starsEl(sc.stars, 'stars bigStars'), h('div', { class: 'score' }, sc.total, h('span', { class: 'muted', style: 'font-size:1.1rem' }, ' Punkte')),
    h('div', { class: 'tblWrap', style: 'text-align:left;margin-top:10px' }, h('table', { class: 'tbl' },
      h('tr', {}, h('th', {}, 'Level'), h('th', {}, 'Details'), h('th', {}, 'Punkte')),
      h('tr', {}, h('td', {}, '1 · Code knacken'), h('td', {}, det1), h('td', {}, sc.s1)),
      h('tr', {}, h('td', {}, '2 · Denkweg'), h('td', {}, `${g.orderWrong} falsche Karten`), h('td', {}, sc.s2)),
      h('tr', {}, h('td', {}, '3 · Packung'), h('td', {}, `${g.packWrong} Fehlversuche`), h('td', {}, sc.s3)),
      h('tr', {}, h('td', {}, '⏱ Zeitbonus'), h('td', {}, fmtTime(metrics.timeMs) + ' min'), h('td', {}, sc.bonus)))),
    saved,
    h('div', { class: 'row center', style: 'margin-top:14px' },
      S.room ? h('button', { class: 'btn green', onclick: () => { S.game = null; renderRoom(); } }, '🏁 Zurück zum Live-Raum')
        : h('button', { class: 'btn green', onclick: () => startGame(g.mode, null) }, '🔁 Nochmal spielen'),
      h('button', { class: 'btn light', onclick: () => { if (S.room) leaveRoom(); renderHome(); } }, '🏠 Gruppe wählen'),
      h('button', { class: 'btn gold', onclick: () => renderLeaderboard(g.mode) }, '🏆 Rangliste'))));
  if (sc.stars === 3) confetti();
  if (!S.auth) { saved.append(h('div', { class: 'note' }, 'Ohne Konto gespielt – die Punkte werden nicht gespeichert. ', h('button', { class: 'linkBtn', onclick: () => loginModal(() => saveRun(metrics, saved, before)) }, 'Jetzt anmelden und speichern'))); return; }
  saveRun(metrics, saved, before);
}
async function saveRun(metrics, box, before) {
  box.innerHTML = ''; box.append(h('span', { class: 'muted' }, 'Speichere …'));
  const r = await api('POST', '/api/run', metrics);
  box.innerHTML = '';
  if (r.status !== 200) {
    box.append(h('div', { class: 'errNote' }, (r.data.error || 'Speichern fehlgeschlagen.') + ' ', h('button', { class: 'linkBtn', onclick: () => saveRun(metrics, box, before) }, 'Nochmal versuchen')));
    if (r.status === 401) { setAuth(null); }
    return;
  }
  S.progress = r.data.progress;
  const best = r.data.progress[metrics.mode].best;
  box.append(h('div', { class: 'okNote' }, r.data.score.total > before && before > 0 ? `🎉 Neuer Bestwert! Vorher: ${before}` : `✔ Gespeichert. Dein Bestwert in dieser Gruppe: ${best}`));
}

/* Schmierzettel */
function scratchCard() {
  const d = h('details', { class: 'scratch card' }, h('summary', {}, '✏️ Mein Schmierzettel ', h('span', { class: 'muted small' }, '(antippen zum Öffnen)')));
  d.addEventListener('toggle', () => { if (d.open && !d.querySelector('.pad')) d.append(drawPad()); }, { once: false });
  return d;
}
function drawPad() {
  const w = 1200, hgt = 520;
  const wrap = h('div', { class: 'pad' }), cv = h('canvas', { width: w, height: hgt, 'aria-label': 'Zeichenfläche' }), x = cv.getContext('2d');
  let color = '#1c2147', size = 4, eraser = false, drawing = false, last = null; const undo = [];
  x.lineCap = 'round'; x.lineJoin = 'round';
  if (S.game && S.game.sketch) x.putImageData(S.game.sketch, 0, 0);
  const save = () => { if (S.game) S.game.sketch = x.getImageData(0, 0, w, hgt); };
  const bar = h('div', { class: 'padBar' }), btns = [];
  const mark = (b) => { btns.forEach((z) => z.classList.remove('on')); b.classList.add('on'); };
  [['#1c2147', 'Schwarz'], ['#e8483a', 'Rot'], ['#2d7fe8', 'Blau'], ['#1fa774', 'Grün']].forEach(([c, n], i) => {
    const b = h('button', { title: n, 'aria-label': n, class: i ? '' : 'on' }, h('span', { class: 'pd', style: `background:${c}` }));
    b.onclick = () => { color = c; eraser = false; mark(b); }; btns.push(b); bar.append(b);
  });
  const er = h('button', { title: 'Radierer', 'aria-label': 'Radierer' }, '🧽'); er.onclick = () => { eraser = true; mark(er); }; btns.push(er); bar.append(er);
  const push = () => { undo.push(x.getImageData(0, 0, w, hgt)); if (undo.length > 15) undo.shift(); };
  bar.append(h('span', { style: 'flex:1' }),
    h('button', { title: 'Rückgängig', 'aria-label': 'Rückgängig', onclick: () => { const s = undo.pop(); if (s) { x.putImageData(s, 0, 0); save(); } } }, '↩︎'),
    h('button', { title: 'Alles löschen', 'aria-label': 'Alles löschen', onclick: () => { push(); x.clearRect(0, 0, w, hgt); save(); } }, '🗑️'));
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * w / r.width, y: (e.clientY - r.top) * hgt / r.height }; };
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); push(); drawing = true; last = pos(e); if (!eraser) { x.fillStyle = color; x.beginPath(); x.arc(last.x, last.y, size / 2, 0, Math.PI * 2); x.fill(); } });
  cv.addEventListener('pointermove', (e) => {
    if (!drawing) return; const p = pos(e);
    x.globalCompositeOperation = eraser ? 'destination-out' : 'source-over'; x.strokeStyle = color; x.lineWidth = eraser ? 28 : size * (e.pointerType === 'pen' && e.pressure ? 0.6 + e.pressure : 1);
    x.beginPath(); x.moveTo(last.x, last.y); x.lineTo(p.x, p.y); x.stroke(); last = p;
  });
  const end = () => { if (!drawing) return; drawing = false; x.globalCompositeOperation = 'source-over'; save(); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  wrap.append(bar, cv);
  return wrap;
}

/* ---------- Rangliste ---------- */
async function renderLeaderboard(mode) {
  S.game = null; setTheme(mode);
  const main = shell({ logo: '🏆', title: 'Rangliste', sub: 'Die besten Code-Knacker jeder Gruppe' });
  const tabs = h('div', { class: 'tabs' }, Object.values(MODES).map((m) => h('button', { class: 'tab' + (m.key === mode ? ' on' : ''), onclick: () => renderLeaderboard(m.key) }, `${m.icon} Gruppe ${m.key}`)));
  const body = h('div', {}, h('p', { class: 'muted' }, 'Lädt …'));
  main.append(h('div', { class: 'card' }, h('h3', {}, `🏆 Gruppe ${mode} – ${MODES[mode].name}`), tabs, body),
    h('div', { class: 'row center' }, h('button', { class: 'btn light', onclick: () => (S.room ? renderRoom() : renderHome()) }, '← Zurück')));
  const r = await api('GET', '/api/leaderboard?mode=' + mode);
  body.innerHTML = '';
  if (r.status !== 200) return body.append(h('div', { class: 'errNote' }, r.data.error || 'Rangliste nicht erreichbar.'));
  if (!r.data.top.length) return body.append(h('p', { class: 'muted' }, 'Noch niemand hat in dieser Gruppe gespielt. Sei die oder der Erste!'));
  body.append(h('div', { class: 'tblWrap' }, h('table', { class: 'tbl' },
    h('tr', {}, h('th', {}, '#'), h('th', {}, 'Spitzname'), h('th', {}, 'Bestwert'), h('th', {}, 'Schnellste Zeit'), h('th', {}, 'Runden')),
    r.data.top.map((p, i) => h('tr', { class: S.auth && p.login.toLowerCase() === S.auth.login.toLowerCase() ? 'me' : '' },
      h('td', {}, i < 3 ? ['🥇', '🥈', '🥉'][i] : String(i + 1)), h('td', {}, p.login), h('td', {}, String(p.best)), h('td', {}, fmtTime(p.fastest)), h('td', {}, String(p.plays)))))));
}

/* ---------- Live-Raum (Multiplayer über WebSocket) ---------- */
class RoomClient {
  constructor(code) {
    this.code = code; this.state = null; this.you = null; this.host = false; this.mode = sess.get('kf_room_mode') || ''; this.closed = false; this.tries = 0;
    this.connect();
    this.pinger = setInterval(() => this.send({ t: 'ping' }), 25000);
  }
  connect() {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?room=${this.code}`);
    this.ws = ws;
    ws.onopen = () => {
      this.tries = 0;
      const hostKey = hostKeyFor(this.code);
      ws.send(JSON.stringify(hostKey ? { t: 'hello', hostKey } : { t: 'hello', token: S.auth && S.auth.token }));
    };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.onMsg(m); };
    ws.onclose = () => {
      if (this.closed) return;
      if (++this.tries > 6) { toast('Verbindung zum Live-Raum verloren.'); return; }
      setTimeout(() => !this.closed && this.connect(), Math.min(8000, 600 * 2 ** this.tries));
    };
  }
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  close() { this.closed = true; clearInterval(this.pinger); try { this.ws.close(); } catch { /* egal */ } }
  onMsg(m) {
    if (m.t === 'welcome') { this.you = m.you; this.host = m.host; sess.set('kf_room', this.code); if (this.mode && !this.host) this.send({ t: 'mode', mode: this.mode }); return; }
    if (m.t === 'error') { toast('⚠️ ' + m.msg); if (m.fatal) { leaveRoom(); if (!S.game) renderHome(); } return; }
    if (m.t === 'room') { this.state = m; onRoomUpdate(); return; }
    if (m.t === 'start') return onRoomStart(m.at);
    if (m.t === 'reset') { if (S.game) { S.game = null; toast('Die Spielleitung hat die Runde beendet.'); } renderRoom(); }
  }
  me() { return this.state && this.state.players.find((p) => p.id === this.you); }
}
// Nur Lehrkräfte dürfen Räume erstellen: Der Server prüft den Lehrkraft-Code und gibt einen
// geheimen Spielleitungs-Schlüssel zurück, der nur in diesem Browser-Tab gespeichert wird.
async function createRoom(teacherCode) {
  const r = await api('POST', '/api/room', { code: teacherCode });
  if (r.status !== 200) return { error: r.data.error || 'Raum konnte nicht erstellt werden.' };
  sess.set('kf_admin', teacherCode);
  leaveRoom();
  sess.set('kf_host', JSON.stringify({ room: r.data.code, key: r.data.hostKey }));
  S.room = new RoomClient(r.data.code); renderRoom();
  return {};
}
function teacherRoomModal() {
  modal((b, close) => {
    const inp = h('input', { class: 'field', type: 'password', placeholder: 'Lehrkraft-Code', autocomplete: 'off', value: sess.get('kf_admin') || '' });
    const err = h('div', { class: 'errNote hidden', role: 'alert' });
    const go = h('button', { class: 'btn', type: 'submit' }, '➕ Raum erstellen');
    b.append(h('h2', {}, '👩‍🏫 Live-Raum erstellen'),
      h('p', { class: 'muted' }, 'Nur Lehrkräfte können Räume erstellen. Sie leiten den Raum, spielen aber nicht mit.'),
      h('form', { onsubmit: async (e) => {
        e.preventDefault(); go.disabled = true;
        const r = await createRoom(inp.value.trim());
        go.disabled = false;
        if (r.error) { err.textContent = r.error; err.classList.remove('hidden'); return; }
        close();
      } }, inp, err, h('div', { class: 'row end', style: 'margin-top:12px' }, h('button', { class: 'btn light', type: 'button', onclick: close }, 'Abbrechen'), go)));
  });
}
const hostKeyFor = (code) => { try { const x = JSON.parse(sess.get('kf_host') || 'null'); return x && x.room === code ? x.key : null; } catch { return null; } };
function enterRoom(code) { leaveRoom(); S.room = new RoomClient(code); renderRoom(); }
function leaveRoom() { if (S.room) S.room.close(); S.room = null; sess.set('kf_room', null); sess.set('kf_host', null); }
function sendProgress(extra = {}) {
  if (!S.room || !S.game || !S.game.room) return;
  S.room.send({ t: 'progress', stage: S.game.stage, ...extra });
}
function onRoomUpdate() {
  if (S.game) { const l = $('#liveStrip'); if (l) l.replaceWith(liveStrip()); return; }
  if ($('#roomScreen')) renderRoom();
}
function onRoomStart(at) {
  const R = S.room; if (!R) return;
  const begin = () => {
    if (!R.mode) {
      if (R.host) { renderRoom(); return; } // Spielleitung ohne Gruppe schaut nur zu
      modal((b, close) => b.append(h('h2', {}, '🏁 Los geht’s! Wähle deine Gruppe:'), modePicker((k) => { close(); R.setMode(k); startGame(k, R.code); })));
      return;
    }
    startGame(R.mode, R.code);
  };
  const ov = h('div', { class: 'countdown', 'aria-live': 'assertive' }); document.body.append(ov);
  const tick = () => {
    const left = Math.ceil((at - Date.now()) / 1000);
    if (left <= 0) { ov.remove(); begin(); return; }
    ov.textContent = String(left); setTimeout(tick, 200);
  };
  S.game = null; tick();
}
RoomClient.prototype.setMode = function (k) { this.mode = k; sess.set('kf_room_mode', k); this.send({ t: 'mode', mode: k }); };

function modePicker(onPick, current = '') {
  return h('div', { class: 'row' }, Object.values(MODES).map((m) => h('button', {
    class: 'btn ' + (current === m.key ? '' : 'light'), style: current === m.key ? `background:${m.color};box-shadow:0 4px 0 ${m.dark}` : '',
    onclick: () => onPick(m.key),
  }, `${m.icon} ${m.key} · ${m.name.replace('Die ', '')}`)));
}
const stageText = (p, phase) => p.done ? null : phase === 'running' && p.stage > 0 ? `Level ${p.stage} von 3` : p.mode ? 'bereit' : 'wählt Gruppe …';

function liveStrip() {
  const R = S.room, st = R && R.state;
  if (!st) return h('div', { class: 'live', id: 'liveStrip' }, '🏁 Live-Raum ', R ? R.code : '', ' · verbinde …');
  const ps = st.players.filter((p) => p.mode), done = ps.filter((p) => p.done).length;
  const me = R.me(); const rank = me && me.done ? ps.filter((p) => p.done).findIndex((p) => p.id === me.id) + 1 : 0;
  return h('div', { class: 'live', id: 'liveStrip' }, h('span', { class: 'dot' }), `Live-Raum ${st.code}`, ' · ', `${ps.length} Spielende`, ' · ', `${done} fertig`, rank ? ` · Du bist auf Platz ${rank}!` : '',
    h('span', { style: 'margin-left:auto;display:flex;gap:6px;flex-wrap:wrap' }, ps.slice(0, 6).map((p) => h('span', { class: 'pill', style: 'padding:4px 8px;font-size:.82rem' }, `${MODES[p.mode].icon} ${p.name} ${p.done ? '✔ ' + p.score : 'L' + Math.max(1, p.stage)}`))));
}

function renderRoom() {
  const R = S.room; if (!R) return renderHome();
  S.game = null; setTheme(R.mode || null);
  const main = shell({ logo: '🏁', title: 'Live-Raum ' + R.code, sub: 'Alle spielen gleichzeitig' });
  main.id = 'roomScreen';
  const st = R.state;
  main.append(h('div', { class: 'card hero' },
    h('div', { class: 'muted', style: 'font-weight:800' }, 'Raum-Code'), h('div', { class: 'roomCode' }, R.code),
    h('p', { class: 'muted', style: 'margin:4px 0 0' }, R.host ? 'Sie sind die Spielleitung 👑. Sagen Sie allen diesen Code – die Kinder geben ihn auf der Startseite ein.' : 'Du bist im Raum. Wähle deine Gruppe und warte auf den Start.')));
  if (!st) { main.append(h('div', { class: 'card' }, h('p', { class: 'muted' }, 'Verbinde …'))); return; }
  const me = R.me();
  if (!R.host) main.append(h('div', { class: 'card' }, h('h3', {}, '🎯 Deine Gruppe'),
    modePicker((k) => { R.setMode(k); renderRoom(); }, R.mode),
    R.mode ? h('div', { class: 'mis mission', style: 'margin-top:10px', html: '<b>Deine Mission:</b> ' + MODES[R.mode].mission }) : h('p', { class: 'muted' }, 'Tippe auf eine Gruppe.'),
    st.phase === 'running' && R.mode && (!me || !me.done) ? h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn green big', onclick: () => startGame(R.mode, R.code) }, '▶ Das Spiel läuft – los geht’s!')) : null,
    st.phase === 'lobby' && !R.host ? h('p', { class: 'muted', style: 'margin:10px 0 0' }, '⏳ Warte, bis die Spielleitung startet …') : null));
  if (R.host) {
    main.append(h('div', { class: 'card' }, h('h3', {}, '👑 Spielleitung'),
      h('div', { class: 'row' },
        h('button', { class: 'btn green big', onclick: () => R.send({ t: 'start' }) }, st.phase === 'running' ? '▶ Neue Runde starten' : '▶ Spiel für alle starten'),
        st.phase === 'running' ? h('button', { class: 'btn light', onclick: () => R.send({ t: 'reset' }) }, '↺ Zurück in die Lobby') : null),
      h('p', { class: 'muted small', style: 'margin:8px 0 0' }, 'Nach dem Start zählt ein Countdown 3-2-1, dann beginnen alle gleichzeitig.')));
  }
  main.append(h('div', { class: 'card' }, h('h3', {}, `👥 Im Raum (${st.players.length})`),
    st.players.length ? null : h('p', { class: 'muted' }, 'Noch niemand da. Die Kinder geben den Code auf der Startseite ein.'),
    h('div', { class: 'tblWrap' }, h('table', { class: 'tbl' },
      h('tr', {}, h('th', {}, ''), h('th', {}, 'Spitzname'), h('th', {}, 'Gruppe'), h('th', {}, 'Stand')),
      st.players.map((p) => h('tr', { class: p.id === R.you ? 'me' : '' },
        h('td', {}, h('span', { class: 'dot' + (p.online ? '' : ' off'), title: p.online ? 'online' : 'offline' })),
        h('td', {}, p.name),
        h('td', {}, p.mode ? `${MODES[p.mode].icon} ${p.mode}` : '–'),
        h('td', {}, p.done ? h('span', {}, '✔ ', h('b', {}, String(p.score)), ' ', starsEl(p.stars)) : stageText(p, st.phase))))))));
  main.append(h('div', { class: 'row center' },
    h('button', { class: 'btn light', onclick: () => renderLeaderboard(R.mode || 'A') }, '🏆 Rangliste'),
    h('button', { class: 'btn light', onclick: () => (R.host ? confirmBox('Raum verlassen?', 'Sie können den Raum danach nicht mehr leiten. Die Kinder bleiben im Raum, aber niemand kann mehr starten.', 'Verlassen', () => { leaveRoom(); renderHome(); }, 'Bleiben') : (leaveRoom(), renderHome())) }, '🚪 Raum verlassen')));
}

/* ---------- Lehrkraft-Ansicht ---------- */
function renderTeacher() {
  S.game = null; setTheme(null);
  const main = shell({ logo: '👩‍🏫', title: 'Lehrkraft-Ansicht', sub: 'Auswertung aller Spielrunden' });
  const code = h('input', { class: 'field', type: 'password', placeholder: 'Lehrkraft-Code', autocomplete: 'off', style: 'max-width:280px' });
  const out = h('div');
  const load = async () => {
    out.innerHTML = ''; out.append(h('p', { class: 'muted' }, 'Lädt …'));
    const r = await api('POST', '/api/admin/results', { code: code.value });
    out.innerHTML = '';
    if (r.status !== 200) return out.append(h('div', { class: 'errNote' }, r.data.error || 'Fehler.'));
    sess.set('kf_admin', code.value);
    out.append(h('div', { class: 'card' }, h('h3', {}, '🏁 Live-Raum'),
      h('p', { class: 'muted', style: 'margin:0 0 10px' }, 'Erstellen Sie einen Raum für Ihre Klasse. Alle spielen gleichzeitig, Sie sehen live den Stand.'),
      h('button', { class: 'btn green', onclick: async () => { const x = await createRoom(code.value.trim()); if (x.error) toast(x.error); } }, '➕ Live-Raum erstellen')));
    showResults(out, r.data.runs);
  };
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
  main.append(h('div', { class: 'card' }, h('h3', {}, '🔐 Zugang'),
    h('p', { class: 'muted', style: 'margin:0 0 10px' }, 'Den Code legt die Person fest, die das Spiel betreibt (GitHub-Secret ADMIN_CODE).'),
    h('div', { class: 'row' }, code, h('button', { class: 'btn', onclick: load }, 'Öffnen'))), out,
  h('div', { class: 'row center' }, h('button', { class: 'btn light', onclick: renderHome }, '← Zurück')));
  const saved = sess.get('kf_admin'); if (saved) { code.value = saved; load(); }
}
function showResults(out, runs) {
  const avg = (a, f) => (a.length ? (a.reduce((s, r) => s + f(r), 0) / a.length) : 0);
  const pct = (a, f) => (a.length ? Math.round(100 * a.filter(f).length / a.length) + ' %' : '–');
  const rows = Object.values(MODES).map((m) => {
    const a = runs.filter((r) => r.mode === m.key);
    const extra = m.key === 'A' ? `Tipp benutzt: ${pct(a, (r) => r.tip)}` : m.key === 'B' ? `KI selbst geprüft (ja): ${pct(a, (r) => r.ki_check === 'ja')}` : `Ø Denkanstöße: ${avg(a, (r) => r.hints).toFixed(1)}`;
    return h('tr', {}, h('td', {}, `${m.icon} ${m.key} – ${m.name}`), h('td', {}, String(a.length)), h('td', {}, String(new Set(a.map((r) => r.account_id)).size)),
      h('td', {}, a.length ? Math.round(avg(a, (r) => r.score)) : '–'), h('td', {}, a.length ? fmtTime(avg(a, (r) => r.time_ms)) : '–'),
      h('td', {}, a.length ? avg(a, (r) => r.wrong_checks).toFixed(1) : '–'), h('td', {}, a.length ? avg(a, (r) => r.order_wrong).toFixed(1) : '–'),
      h('td', {}, a.length ? avg(a, (r) => r.pack_wrong).toFixed(1) : '–'), h('td', {}, extra));
  });
  const csv = () => {
    const cols = ['played', 'login', 'mode', 'score', 'stars', 'time_ms', 'wrong_checks', 'hints', 'tip', 'ki_check', 'ki_wrong', 'order_wrong', 'pack_wrong', 'room', 'explain'];
    const q = (v) => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const text = '﻿' + cols.join(';') + '\n' + runs.map((r) => cols.map((c) => q(c === 'played' ? new Date(r.played).toLocaleString('de-DE') : r[c])).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = h('a', { href: url, download: `Kristallfabrik_Auswertung_${new Date().toISOString().slice(0, 10)}.csv` }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  out.append(h('div', { class: 'card' }, h('h3', {}, '📊 Vergleich der drei Gruppen'),
    h('div', { class: 'tblWrap' }, h('table', { class: 'tbl' },
      h('tr', {}, ...['Gruppe', 'Runden', 'Kinder', 'Ø Punkte', 'Ø Zeit', 'Ø Fehler Schloss', 'Ø Fehler Denkweg', 'Ø Fehler Packung', 'Besonderes'].map((t) => h('th', {}, t))), rows)),
    h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn', onclick: csv }, '⬇️ Alle Runden als CSV (Excel)'))));
  out.append(h('div', { class: 'card' }, h('h3', {}, `🗂️ Letzte Runden (${runs.length})`),
    runs.length ? h('div', { class: 'tblWrap' }, h('table', { class: 'tbl' },
      h('tr', {}, ...['Zeitpunkt', 'Spitzname', 'Gruppe', 'Punkte', 'Zeit', 'In eigenen Worten'].map((t) => h('th', {}, t))),
      runs.slice(0, 200).map((r) => h('tr', {}, h('td', {}, new Date(r.played).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })), h('td', {}, r.login),
        h('td', {}, MODES[r.mode] ? MODES[r.mode].icon + ' ' + r.mode : r.mode), h('td', {}, String(r.score)), h('td', {}, fmtTime(r.time_ms)), h('td', {}, r.explain || '–'))))) : h('p', { class: 'muted' }, 'Noch keine Runden.')));
}

/* ---------- Start ---------- */
(function boot() {
  const room = sess.get('kf_room');
  if (room && (S.auth || hostKeyFor(room))) { S.room = new RoomClient(room); renderRoom(); } else renderHome();
})();
