import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VALUES, CRATES, PACK, STEPS, COACH_C, SOLUTION_B, checkCode, checkPack, canPlace, computeScore, crateSum, REAL_STEPS } from '../public/shared/game.js';

test('Die Lösung passt zu allen drei Kisten', () => {
  for (const c of CRATES) assert.equal(crateSum(c.items, VALUES), c.sum, 'Kiste ' + c.n);
  assert.equal(checkCode(VALUES).solved, true);
});

test('Die Lösung ist eindeutig (ganze Zahlen 0–30)', () => {
  let n = 0;
  for (let R = 0; R <= 30; R++) for (let B = 0; B <= 30; B++) for (let G = 0; G <= 30; G++)
    if (checkCode({ R, B, G }).crates.every((c) => c.state === 'ok')) n++;
  assert.equal(n, 1);
});

test('Code-Schloss meldet zu viel / zu wenig', () => {
  const r = checkCode({ R: 6, B: 3, G: 7 });
  assert.equal(r.solved, false);
  assert.deepEqual(r.crates.map((c) => c.state), ['hoch', 'hoch', 'hoch']);
  assert.equal(checkCode({ R: 1, B: 1, G: 1 }).crates[0].state, 'tief');
});

test('Kristall-Packung: genau eine Lösung (2× Rot, 1× Blau, 2× Grün)', () => {
  const sols = [];
  for (let r = 1; r <= 3; r++) for (let b = 1; b <= 3; b++) { const g = PACK.size - r - b; if (g >= 1 && checkPack([...'R'.repeat(r), ...'B'.repeat(b), ...'G'.repeat(g)]).ok) sols.push([r, b, g]); }
  assert.deepEqual(sols, [[2, 1, 2]]);
  assert.equal(checkPack(['R', 'R', 'B', 'G']).why, 'anzahl');
  assert.equal(checkPack(['R', 'R', 'R', 'G', 'G']).why, 'farbe');
  assert.equal(checkPack(['R', 'B', 'G', 'G', 'G']).why, 'hoch');
  assert.equal(checkPack(['R', 'B', 'B', 'B', 'G']).why, 'tief');
});

test('Denkweg: Reihenfolge und Falle', () => {
  assert.equal(canPlace('rb', []), false);
  assert.equal(canPlace('paar', []), true);
  assert.equal(canPlace('b', ['paar']), true);
  assert.equal(canPlace('rg', ['paar', 'b']), false);
  assert.equal(canPlace('rg', ['paar', 'b', 'rb']), true);
  assert.equal(canPlace('falle', ['paar', 'b', 'rb', 'rg', 'probe']), false);
  assert.equal(REAL_STEPS, STEPS.length - 1);
});

test('Der KI-Coach verrät nie einen Kristallwert', () => {
  for (const c of COACH_C) {
    assert.ok(c.answer == null || !Object.values(VALUES).includes(c.answer), 'Antwort ist ein Kristallwert: ' + c.answer);
    for (const t of [c.q, c.yes, c.no]) assert.doesNotMatch(t, /(Rot|Blau|Grün|R|B|G)\s*=\s*\d/);
  }
});

test('Der KI-Roboter zeigt die vollständige Lösung', () => {
  const all = SOLUTION_B.join(' ');
  for (const v of ['B = 9 : 3 = 3', 'R = 8 − 3 = 5', 'G = 12 − 5 = 7']) assert.ok(all.includes(v), v);
});

test('Punkte: perfektes Spiel und Abzüge', () => {
  const best = computeScore({ timeMs: 90_000 });
  assert.deepEqual(best, { s1: 400, s2: 300, s3: 300, bonus: 100, total: 1100, stars: 3 });
  const s = computeScore({ wrongChecks: 2, hints: 3, orderWrong: 1, packWrong: 1, timeMs: 300_000 });
  assert.equal(s.s1, 400 - 80 - 90);
  assert.equal(s.s2, 250);
  assert.equal(s.s3, 250);
  assert.equal(s.bonus, 50);
  assert.equal(computeScore({ wrongChecks: 99, orderWrong: 99, packWrong: 99, timeMs: 1e9 }).total, 200);
  assert.equal(computeScore({ wrongChecks: -5, timeMs: -1 }).total, 1100); // Unsinn wird abgefangen
});
