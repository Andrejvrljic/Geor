// Spielregeln der Kristallfabrik – wird im Browser UND im Cloudflare-Worker benutzt
// (der Server rechnet die Punkte selbst nach, damit niemand Fantasiepunkte einträgt).

export const VALUES = { R: 5, B: 3, G: 7 };

export const CRATES = [
  { n: 1, items: ['R', 'R', 'B', 'G'], sum: 20 },
  { n: 2, items: ['R', 'B', 'B', 'B', 'G'], sum: 21 },
  { n: 3, items: ['R', 'R', 'G', 'G'], sum: 24 },
];

export const PACK = { size: 5, sum: 27 };

export const MODES = {
  A: {
    key: 'A', name: 'Die Selberdenker', icon: '🧠', color: '#1fa774', dark: '#11734f', soft: '#e3f8ee',
    sub: 'Ohne KI · Du nutzt deine eigenen Ideen.',
    mission: 'Finde die Werte selbst. Probiere systematisch, vergleiche die Kisten und prüfe deine Vermutung.',
    rules: [
      'Du spielst <b>ohne KI</b> – nur mit deinem Kopf und dem Schmierzettel.',
      'Es gibt <b>einen Tipp</b>. Er kostet ein paar Punkte.',
      'Jeder falsche Versuch am Code-Schloss kostet Punkte.',
    ],
  },
  B: {
    key: 'B', name: 'Die KI-Löser', icon: '🤖', color: '#f07a12', dark: '#b65500', soft: '#fff1e3',
    sub: 'Mit KI · Du darfst die vollständige Lösung anfordern.',
    mission: 'Lass dir vom KI-Roboter die ganze Lösung zeigen. Lies sie genau, prüfe sie nach und merke dir den Weg.',
    rules: [
      'Der <b>KI-Roboter</b> zeigt dir die komplette Lösung Schritt für Schritt.',
      'Danach <b>prüfst du die KI</b> selbst: Stimmen die Summen wirklich?',
      'Später wird die Lösung zugeklappt – dann zeigst du, was du behalten hast.',
    ],
  },
  C: {
    key: 'C', name: 'Die KI-Trainer', icon: '🧭', color: '#7b4fe0', dark: '#5634b0', soft: '#efe8ff',
    sub: 'Mit KI · Sie hilft dir beim Denken, aber nicht mit der fertigen Antwort.',
    mission: 'Bitte den KI-Coach um einzelne Denkanstöße. Du selbst rechnest und überprüfst.',
    rules: [
      'Der <b>KI-Coach</b> verrät dir <b>keine Werte</b> – nur Fragen und kleine Hinweise.',
      'Du beantwortest seine Fragen und rechnest selbst.',
      'Jeder Hinweis kostet ein paar Punkte – frag nur, wenn du ihn brauchst.',
    ],
  },
};

export const TIP_A = 'Welche Kiste macht es dir besonders leicht, zwei Farben gemeinsam zu untersuchen?';

// Die vollständige Lösung des KI-Roboters (Gruppe B)
export const SOLUTION_B = [
  'Kiste 3: R + R + G + G = 24. Das sind zwei gleiche Paare (R + G). Also ist R + G = 24 : 2 = 12.',
  'Kiste 1: R + R + B + G = 20. Darin steckt ein Paar R + G = 12. Es bleibt R + B = 20 − 12 = 8.',
  'Kiste 2: R + B + B + B + G = 21. Darin steckt auch ein Paar R + G = 12. Es bleibt B + B + B = 21 − 12 = 9. Also ist B = 9 : 3 = 3.',
  'Aus R + B = 8 folgt R = 8 − 3 = 5. Aus R + G = 12 folgt G = 12 − 5 = 7.',
  'Ergebnis: Rot = 5, Blau = 3, Grün = 7. Zur Probe setzt man die Werte in alle drei Kisten ein – das darfst du jetzt selbst machen!',
];

// Die Denkanstöße des KI-Coaches (Gruppe C): eine Frage nach der anderen, nie ein Kristallwert.
// answer = Zahl, die das Kind selbst ausrechnen soll (Paar-Summen, keine Einzelwerte).
export const COACH_C = [
  { q: 'Schau dir alle drei Kisten an. In welcher Kiste kommen nur <b>zwei</b> Farben vor – und jede gleich oft?', answer: null,
    choices: ['Kiste 1', 'Kiste 2', 'Kiste 3'], correct: 'Kiste 3',
    yes: 'Genau! In Kiste 3 sind zwei Rote und zwei Grüne.', no: 'Zähl nochmal die Farben in jeder Kiste.' },
  { q: 'Kiste 3 besteht aus zwei gleichen Paaren „Rot + Grün“. Wie viel ist dann <b>ein</b> Rot + Grün zusammen?', answer: 12,
    yes: 'Stark! Dieses Paar kannst du jetzt in anderen Kisten wiederfinden.', no: 'Tipp: Zwei gleiche Paare ergeben zusammen 24. Teile gerecht auf.' },
  { q: 'Auch in Kiste 1 steckt ein Paar Rot + Grün. Nimm es in Gedanken heraus. Wie viel ist dann Rot + Blau?', answer: 20 - 12,
    yes: 'Richtig gedacht! Merk dir diese Zahl.', no: 'Kiste 1 hat 20. Wenn du das Paar Rot + Grün wegnimmst, was bleibt übrig?' },
  { q: 'Kiste 2 hat ebenfalls ein Paar Rot + Grün. Wie viel sind die <b>drei Blauen</b> zusammen?', answer: 21 - 12,
    yes: 'Super! Und wie viel ist dann <b>ein</b> Blauer? Das rechnest du jetzt selbst.', no: 'Kiste 2 hat 21. Nimm das Paar Rot + Grün heraus – was bleibt für die Blauen?' },
  { q: 'Wenn du Blau kennst: Wie findest du mit „Rot + Blau“ den Wert von Rot? Und danach Grün? Trag deine Werte ins Code-Schloss ein.', answer: null,
    yes: '', no: '' },
  { q: 'Mach die Probe: Setze deine Werte in <b>alle drei</b> Kisten ein. Stimmt jede Summe? Erst dann drückst du „Code prüfen“.', answer: null,
    yes: '', no: '' },
];

// Denkweg-Puzzle: Karten in eine sinnvolle Reihenfolge bringen.
// need = Karten, die vorher liegen müssen. Die Ablenkungskarte (need: null) darf nie gelegt werden.
export const STEPS = [
  { id: 'paar', text: 'Kiste 3 halbieren: Rot + Grün = 12', need: [] },
  { id: 'rb', text: 'In Kiste 1 das Paar Rot + Grün herausnehmen: Rot + Blau = 8', need: ['paar'] },
  { id: 'b', text: 'In Kiste 2 das Paar Rot + Grün herausnehmen: 3 Blaue = 9, also Blau = 3', need: ['paar'] },
  { id: 'rg', text: 'Rot = 8 − 3 = 5, danach Grün = 12 − 5 = 7', need: ['rb', 'b'] },
  { id: 'probe', text: 'Probe: Werte in alle drei Kisten einsetzen', need: ['rg'] },
  { id: 'falle', text: 'Alle Kisten zusammenzählen: 20 + 21 + 24 = 65', need: null },
];

export const crateSum = (items, v) => items.reduce((s, k) => s + (Number(v[k]) || 0), 0);

// Prüft die Werte im Code-Schloss: pro Kiste "ok" | "hoch" | "tief"
export function checkCode(v) {
  const res = CRATES.map((c) => { const s = crateSum(c.items, v); return { n: c.n, sum: s, want: c.sum, state: s === c.sum ? 'ok' : s > c.sum ? 'hoch' : 'tief' }; });
  return { solved: ['R', 'B', 'G'].every((k) => Number(v[k]) === VALUES[k]), crates: res };
}

// Prüft die Kristall-Packung
export function checkPack(pack) {
  const list = Array.isArray(pack) ? pack.filter((k) => k in VALUES) : [];
  const sum = crateSum(list, VALUES);
  const missing = ['R', 'B', 'G'].filter((k) => !list.includes(k));
  if (list.length !== PACK.size) return { ok: false, why: 'anzahl', sum, count: list.length };
  if (missing.length) return { ok: false, why: 'farbe', sum, missing };
  if (sum !== PACK.sum) return { ok: false, why: sum > PACK.sum ? 'hoch' : 'tief', sum };
  return { ok: true, sum };
}

// Darf eine Denkweg-Karte jetzt gelegt werden?
export function canPlace(id, placed) {
  const s = STEPS.find((x) => x.id === id);
  if (!s || !s.need || placed.includes(id)) return false;
  return s.need.every((n) => placed.includes(n));
}
export const REAL_STEPS = STEPS.filter((s) => s.need).length;

const int = (x, max = 999) => Math.max(0, Math.min(max, Math.floor(Number(x) || 0)));

// Punkte – genau diese Rechnung macht auch der Server.
export function computeScore(m) {
  const wrong = int(m.wrongChecks), hints = int(m.hints, COACH_C.length), tip = m.tip ? 1 : 0, kiWrong = int(m.kiCheckWrong);
  const s1 = Math.max(100, 400 - 40 * wrong - 30 * hints - 30 * tip - 40 * kiWrong);
  const s2 = Math.max(50, 300 - 50 * int(m.orderWrong));
  const s3 = Math.max(50, 300 - 50 * int(m.packWrong));
  const sec = int(m.timeMs, 36e5 * 10) / 1000;
  const bonus = Math.round(100 * Math.max(0, Math.min(1, (480 - sec) / 360)));
  const total = s1 + s2 + s3 + bonus;
  return { s1, s2, s3, bonus, total, stars: total >= 900 ? 3 : total >= 650 ? 2 : 1 };
}
export const MAX_SCORE = 1100;
