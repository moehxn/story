/* Reasoning GENERATORS — fresh variants (pattern-based, labeled AI-GENERATED PRACTICE) */
import { sub } from './_shared.js';

const R = (arr) => arr[Math.floor(Math.random() * arr.length)];
const RI = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ltr = (i) => A[((i % 26) + 26) % 26];
const pos = (ch) => A.indexOf(ch.toUpperCase()) + 1;

function mkOptions(correct, distractors) {
  const uniq = [correct];
  for (const d of distractors) if (d !== null && d !== undefined && !uniq.includes(d)) uniq.push(d);
  let f = 1;
  while (uniq.length < 4) { const v = typeof correct === 'number' ? correct + f : ltr(pos(String(correct)[0]) + f); if (!uniq.includes(v)) uniq.push(v); f++; }
  const opts = uniq.slice(0, 4);
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return { options: opts.map(String), answer: opts.indexOf(correct) };
}

const gen = (id, label, topicId, extra, make) => ({ id, label, topicId, subjectId: 'REASONING', source: 'EXPECTED', make, ...extra });

export const reasoningGenerators = [

gen('g-r-analogy', 'Letter analogy', 'analogies', { conceptId: 'r-an-1', difficulty: 2 }, () => {
  const shift = RI(1, 4);
  const words = ['CAT', 'DOG', 'SUN', 'PEN', 'BUS', 'FAN', 'CAR', 'CUP', 'BAG', 'KEY', 'JAR', 'MAP', 'NET', 'OWL', 'TOY'];
  const w1 = R(words); let w2 = R(words); while (w2 === w1) w2 = R(words);
  const code = (w, s) => w.split('').map(c => ltr(pos(c) + s)).join('');
  const correct = code(w2, shift);
  const { options, answer } = mkOptions(correct, [code(w2, shift + 1), code(w2, shift - 1), code(w2, -shift)]);
  return { text: `${w1} : ${code(w1, shift)} :: ${w2} : ?`, options, answer,
    solution: [`${w1} → ${code(w1, shift)}: each letter moves ${shift > 0 ? '+' : ''}${shift}.`, `Apply to ${w2}: ${w2.split('').map(c => `${c}→${ltr(pos(c) + shift)}`).join(', ')}.`, `Answer: ${correct}.`],
    wrongWhy: null, signature: `an-${w1}-${w2}-${shift}`,
    tests: 'Letter shift analogy.', recall: 'Convert to positions, apply the shift.',
    memory: { tech: 'Number line', x: 'Letters are numbers; the analogy is arithmetic.' } };
}),

gen('g-r-letseries', 'Letter series', 'alphabetical-series', { conceptId: 'r-al-1', difficulty: 1 }, () => {
  const mode = RI(1, 3);
  let seq = [], rule = '';
  if (mode === 1) {
    const step = R([2, 3, 4]); const start = RI(0, 8);
    for (let i = 0; i < 6; i++) seq.push(ltr(start + i * step));
    rule = `Each letter jumps +${step}.`;
  } else if (mode === 2) {
    const start = RI(0, 5); let s = start; seq = [ltr(s)];
    for (let i = 2; i <= 6; i++) { s += i; seq.push(ltr(s)); }
    rule = 'Jumps grow: +2, +3, +4, +5, +6 …';
  } else {
    const step = R([2, 3]); const start = RI(0, 8); let up = true;
    let s = start;
    for (let i = 0; i < 6; i++) { seq.push(ltr(s)); s += up ? step : -step; up = !up; }
    rule = `Alternating: +${step}, −${step} …`;
  }
  const shown = seq.slice(0, 5).join(', ');
  const next = seq[5];
  const { options, answer } = mkOptions(next, [ltr(pos(next) + 1), ltr(pos(next) - 1), ltr(pos(next) + 2)]);
  return { text: `Find the next letter: ${shown}, ?`, options, answer,
    solution: [`Positions: ${seq.map(c => pos(c)).join(', ')}.`, rule, `Next position = ${pos(next)} → ${next}.`],
    wrongWhy: null, signature: `ls-${seq.join('')}`,
    tests: 'Letter series pattern.', recall: 'Letters → positions → differences.',
    memory: { tech: 'EJOTY', x: 'E5 J10 O15 T20 Y25 anchor points.' } };
}),

gen('g-r-numseries', 'Number series', 'number-series', { conceptId: 'r-ns-1', difficulty: 2 }, () => {
  const mode = RI(1, 5);
  let seq = [], rule = '', next;
  if (mode === 1) { const a = RI(1, 9), d = R([3, 4, 5, 6, 7]); seq = [a, a + d, a + 2 * d, a + 3 * d, a + 4 * d]; next = a + 5 * d; rule = `Constant difference +${d}.`; }
  else if (mode === 2) { const a = RI(1, 5); let s = a; seq = [s]; for (let i = 2; i <= 5; i++) { s += i; seq.push(s); } next = s + 7; rule = 'Growing differences +2, +3, +4, +5, +6, next +7.'; }
  else if (mode === 3) { const a = R([2, 3, 4, 5]), r = R([2, 3]); seq = [a, a * r, a * r * r, a * r ** 3, a * r ** 4]; next = a * r ** 5; rule = `Each term × ${r}.`; }
  else if (mode === 4) { const a = RI(1, 3); seq = [a * a, (a + 1) ** 2, (a + 2) ** 2, (a + 3) ** 2, (a + 4) ** 2]; next = (a + 5) ** 2; rule = 'Perfect squares.'; }
  else { let x = RI(1, 4), y = RI(2, 5); seq = [x, y]; for (let i = 0; i < 3; i++) seq.push(seq[seq.length - 1] + seq[seq.length - 2]); next = seq[4] + seq[3]; rule = 'Fibonacci style: each = sum of previous two.'; }
  const { options, answer } = mkOptions(next, [next + seq[1] - seq[0], next - 1, next + 2, next * 2]);
  return { text: `Find the next number: ${seq.join(', ')}, ?`, options, answer,
    solution: [`Differences/ratios first.`, rule, `Next term = ${next}.`],
    wrongWhy: null, signature: `ns-${seq.join('-')}`,
    tests: 'Number series pattern.', recall: 'D-R-S ladder: differences, ratios, squares.',
    memory: { tech: 'D-R-S ladder', x: 'Differences → Ratios → Squares.' } };
}),

gen('g-r-coding', 'Coding-decoding', 'coding-decoding', { conceptId: 'r-cd-1', difficulty: 2 }, () => {
  const mode = RI(1, 3);
  const words = ['LOVE', 'HATE', 'MIND', 'LAMP', 'ROAD', 'FISH', 'GOLD', 'RAIN', 'STAR', 'MOON', 'WIND', 'FIRE'];
  const w1 = R(words); let w2 = R(words); while (w2 === w1) w2 = R(words);
  let code, rule, apply, correct;
  if (mode === 1) {
    const s = R([1, 2, 3]);
    code = w1.split('').map(c => ltr(pos(c) + s)).join('');
    rule = `Every letter +${s}.`;
    correct = w2.split('').map(c => ltr(pos(c) + s)).join('');
  } else if (mode === 2) {
    code = w1.split('').reverse().join('');
    rule = 'The word is written backwards.';
    correct = w2.split('').reverse().join('');
  } else {
    code = w1.split('').map(c => ltr(27 - pos(c))).join('');
    rule = 'Mirror alphabet: A↔Z, B↔Y (position n → 27−n).';
    correct = w2.split('').map(c => ltr(27 - pos(c))).join('');
  }
  const { options, answer } = mkOptions(correct, [w2.split('').map(c => ltr(pos(c) + 1)).join(''), correct.split('').reverse().join(''), w2.split('').map(c => ltr(27 - pos(c) - 1)).join('')]);
  return { text: `If ${w1} is coded as ${code}, how is ${w2} coded?`, options, answer,
    solution: [`${w1} → ${code}: ${rule}`, `Apply to ${w2} → ${correct}.`],
    wrongWhy: null, signature: `cd-${w1}-${w2}-${mode}`,
    tests: 'Coding rule extraction.', recall: 'Extract rule from the example, verify on all letters.',
    memory: { tech: 'Mirror between M and N', x: 'Reverse alphabet: n → 27−n.' } };
}),

gen('g-r-mathops', 'Mathematical operations', 'mathematical-operations', { conceptId: 'r-mo-1', difficulty: 2 }, () => {
  const a = RI(3, 12), b = RI(2, 9), c = RI(2, 6);
  const map = R([
    { desc: '“+” means “×” and “−” means “÷”', expr: `${a} + ${b} − ${c}`, real: `${a} × ${b} ÷ ${c}` },
    { desc: '“×” means “+” and “÷” means “−”', expr: `${a} × ${b} ÷ ${c}`, real: `${a} + ${b} − ${c}` },
    { desc: '“+” means “÷” and “×” means “+”', expr: `${a * c} + ${b} × ${c}`, real: `${a * c} ÷ ${b} + ${c}` },
  ]);
  const val = map.real.match(/\d+|[+×÷−+]/g);
  // safe evaluation of simple a op b op c chains
  const tokens = map.real.split(' ');
  let result;
  if (tokens[1] === '×' || tokens[1] === '÷') {
    let r = tokens[1] === '×' ? +tokens[0] * +tokens[2] : +tokens[0] / +tokens[2];
    result = tokens[3] === '+' ? r + +tokens[4] : tokens[3] === '−' ? r - +tokens[4] : tokens[3] === '×' ? r * +tokens[4] : r / +tokens[4];
  } else {
    let r = tokens[1] === '+' ? +tokens[0] + +tokens[2] : +tokens[0] - +tokens[2];
    result = tokens[3] === '+' ? r + +tokens[4] : tokens[3] === '−' ? r - +tokens[4] : tokens[3] === '×' ? r * +tokens[4] : r / +tokens[4];
  }
  result = Math.round(result * 100) / 100;
  const { options, answer } = mkOptions(result, [result + 2, result - 1, a + b + c, a * b - c]);
  return { text: `If ${map.desc}, evaluate: ${map.expr}`, options, answer,
    solution: [`Swap first: ${map.expr} becomes ${map.real}.`, `Now BODMAS: ${map.real} = ${result}.`],
    wrongWhy: null, signature: `mo-${map.expr}-${result}`,
    tests: 'Sign swapping + BODMAS.', recall: 'Swap first, then BODMAS.',
    memory: { tech: 'Two-pass rule', x: 'Pass 1 swap, pass 2 solve.' } };
}),

gen('g-r-di', 'Data interpretation table', 'data-interpretation', { conceptId: 'r-di-1', difficulty: 2 }, () => {
  const days = ['Mon', 'Tue', 'Wed'];
  const items = [['chairs', 'tables', 'lamps'][RI(0, 2)]];
  const vals = [RI(10, 30) * 10, 0, 0];
  vals[1] = vals[0] + RI(2, 8) * 10;
  vals[2] = vals[1] + RI(2, 8) * 10;
  const qType = R(['total', 'diff', 'increase']);
  let correct, qtext, sol;
  if (qType === 'total') { correct = vals[0] + vals[1] + vals[2]; qtext = `What is the total number of ${items[0]} sold in the three days?`; sol = [`Total = ${vals[0]} + ${vals[1]} + ${vals[2]} = ${correct}.`]; }
  else if (qType === 'diff') { correct = vals[2] - vals[0]; qtext = `How many more ${items[0]} were sold on Wednesday than on Monday?`; sol = [`Difference = ${vals[2]} − ${vals[0]} = ${correct}.`]; }
  else { const pct = Math.round((vals[1] - vals[0]) / vals[0] * 100); correct = pct; qtext = `By what percent did ${items[0]} sales increase from Monday to Tuesday?`; sol = [`Increase = ${vals[1] - vals[0]}.`, `Percent = ${vals[1] - vals[0]} ÷ ${vals[0]} × 100 = ${pct}%.`]; }
  const { options, answer } = mkOptions(correct, [correct + 10, Math.round(correct * 1.5), Math.round(correct / 2)]);
  return { text: `A shop sold these numbers of ${items[0]}: Mon ${vals[0]}, Tue ${vals[1]}, Wed ${vals[2]}.\n${qtext}`, options, answer,
    solution: sol, wrongWhy: null, signature: `di-${vals.join('-')}-${qType}`,
    tests: 'Reading a table + one calculation.', recall: 'Title → units → exact cells → calculate.',
    memory: { tech: 'Title-then-cell', x: 'Two seconds on the labels save minutes.' } };
}),

gen('g-r-rank', 'Ranking from both ends', 'analytical-reasoning', { conceptId: 'r-ar-1', difficulty: 2 }, () => {
  const total = R([30, 35, 40, 45, 50]);
  const fromLeft = RI(5, 15);
  const correct = total + 1 - fromLeft;
  const { options, answer } = mkOptions(`${correct}th`, [`${correct - 1}th`, `${correct + 1}th`, `${total - fromLeft}th`]);
  return { text: `In a row of ${total} students, A is ${fromLeft}th from the left end. What is A’s position from the right end?`, options, answer,
    solution: [`Right position = Total + 1 − Left position.`, `= ${total} + 1 − ${fromLeft} = ${correct}th.`],
    wrongWhy: null, signature: `rank-${total}-${fromLeft}`,
    tests: 'Row positions from both ends.', recall: 'Left + Right = Total + 1.',
    memory: { tech: 'Total+1 anchor', x: 'Positions from both ends add to Total + 1.' } };
}),

gen('g-r-odd', 'Odd one out', 'classification', { conceptId: 'r-cl-1', difficulty: 1 }, () => {
  const sets = [
    { group: ['Rose', 'Lily', 'Jasmine', 'Mango'], odd: 'Mango', why: 'Rose, Lily, Jasmine are flowers; Mango is a fruit tree.' },
    { group: ['Sun', 'Star', 'Galaxy', 'Moon'], odd: 'Moon', why: 'Sun, Star, Galaxy shine by themselves; the Moon only reflects light.' },
    { group: ['Copper', 'Iron', 'Silver', 'Sulphur'], odd: 'Sulphur', why: 'Copper, Iron, Silver are metals; Sulphur is a non-metal.' },
    { group: ['7', '13', '17', '21'], odd: '21', why: '7, 13, 17 are primes; 21 = 3 × 7.' },
    { group: ['22', '33', '44', '41'], odd: '41', why: '22, 33, 44 have repeated digits; 41 does not.' },
    { group: ['Cricket', 'Hockey', 'Chess', 'Swimming'], odd: 'Chess', why: 'Cricket, Hockey, Swimming need big physical movement; Chess is a board game.' },
    { group: ['Kerala', 'Tamil Nadu', 'Karnataka', 'Kolkata'], odd: 'Kolkata', why: 'The first three are states; Kolkata is a city.' },
  ];
  const s = R(sets);
  const shuffled = [...s.group];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const { options, answer } = mkOptions(s.odd, shuffled.filter(x => x !== s.odd));
  return { text: `Find the odd one out: ${shuffled.join(', ')}`, options, answer,
    solution: [s.why, `So the odd one is ${s.odd}.`],
    wrongWhy: null, signature: `odd-${s.odd}-${Math.random().toString(36).slice(2, 6)}`,
    tests: 'Classification.', recall: 'Group three, expose one.',
    memory: { tech: 'Three-plus-one', x: 'Find the trio first.' } };
}),

gen('g-r-dir', 'Direction sense', 'directions', { conceptId: 'r-di2-1', difficulty: 2 }, () => {
  const d = RI(2, 9);
  const e = RI(2, 9);
  const start = R(['North', 'South', 'East', 'West']);
  const rightOf = { North: 'East', East: 'South', South: 'West', West: 'North' };
  const leftOf = { North: 'West', West: 'South', South: 'East', East: 'North' };
  const turn1 = R(['right', 'left']);
  const facing1 = turn1 === 'right' ? rightOf[start] : leftOf[start];
  const turn2 = R(['right', 'left']);
  const facing2 = turn2 === 'right' ? rightOf[facing1] : leftOf[facing1];
  const move1 = { North: [0, d], South: [0, -d], East: [d, 0], West: [-d, 0] }[start];
  const move2 = { North: [0, e], South: [0, -e], East: [e, 0], West: [-e, 0] }[facing1];
  const move3 = { North: [0, d], South: [0, -d], East: [d, 0], West: [-d, 0] }[facing2];
  const dx = move1[0] + move2[0] + move3[0], dy = move1[1] + move2[1] + move3[1];
  let answerStr;
  if (dx === 0 && dy === 0) answerStr = 'He is back at the start';
  else if (dx === 0) answerStr = `${Math.abs(dy)} km ${dy > 0 ? 'North' : 'South'}`;
  else if (dy === 0) answerStr = `${Math.abs(dx)} km ${dx > 0 ? 'East' : 'West'}`;
  else answerStr = `${Math.abs(dy)} km ${dy > 0 ? 'North' : 'South'} and ${Math.abs(dx)} km ${dx > 0 ? 'East' : 'West'}`;
  const { options, answer } = mkOptions(answerStr, [
    dx === 0 ? `${d + e} km ${dx >= 0 ? 'East' : 'West'}` : `${Math.abs(dy) || d} km ${dy >= 0 ? 'North' : 'South'}`,
    'He is back at the start', `${d + e} km from the start`,
  ].filter(x => x !== answerStr));
  return { text: `A man facing ${start} walks ${d} km, turns ${turn1} and walks ${e} km, then turns ${turn2} and walks ${d} km again. Where is he from his starting point?`, options, answer,
    solution: [`Facing ${start}, first walk ${d} km ${start}.`, `${turn1} turn → now facing ${facing1}, walk ${e} km.`, `${turn2} turn → now facing ${facing2}, walk ${d} km.`, `Net displacement: ${answerStr}.`],
    wrongWhy: null, signature: `dir-${start}-${d}-${e}-${turn1}-${turn2}`,
    tests: 'Direction sense + net displacement.', recall: 'Draw axes, plot arrows, cancel opposites.',
    memory: { tech: 'Clock face', x: 'Right = clockwise turn of your facing.' } };
}),
];
