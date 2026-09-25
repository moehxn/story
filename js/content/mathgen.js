/* ============================================================
   MATHS GENERATORS — fresh variants for weak-model drilling.
   Rule (spec §7): SAME concept/model + DIFFERENT numbers/context.
   Output is ALWAYS labeled AI-GENERATED PRACTICE by the selector.
   Every variant carries its own step-by-step solution.
   ============================================================ */
import { sub } from './_shared.js';
const G = sub('MATH').q; // not used directly; generators build raw objects

const R = (arr) => arr[Math.floor(Math.random() * arr.length)];
const RI = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const fmt = (n) => (Number.isInteger(n) ? n.toLocaleString('en-IN') : String(n));
const rupee = (n) => '₹' + fmt(n);

function mkOptions(correct, distractors, fmtFn = (x) => String(x)) {
  const uniq = [correct];
  for (const d of distractors) {
    if (d !== null && d !== undefined && !uniq.some(u => String(u) === String(d))) uniq.push(d);
  }
  let filler = 1;
  while (uniq.length < 4) { const f = typeof correct === 'number' ? correct + filler * (Math.abs(correct) > 20 ? 10 : 3) : `option ${filler}`; if (!uniq.some(u => String(u) === String(f))) uniq.push(f); filler++; }
  const opts = uniq.slice(0, 4);
  // deterministic-ish shuffle
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return { options: opts.map(fmtFn), answer: opts.findIndex(o => String(o) === String(correct)) };
}

const gen = (id, label, topicId, extra, make) =>
  ({ id, label, topicId, subjectId: 'MATH', source: 'EXPECTED', make, ...extra });

export const mathGenerators = [

/* ---------- NUMBER SYSTEM ---------- */
gen('g-ns-div', 'Divisibility check', 'number-system', { conceptId: 'm-ns-divisibility', difficulty: 1 }, () => {
  const div = R([3, 4, 9, 11]);
  const yes = Math.random() < 0.5;
  const digitSum = (n) => String(n).split('').reduce((a, d) => a + +d, 0);
  const altSum = (n) => String(n).split('').map(Number).reduce((a, d, i) => a + (i % 2 === 0 ? d : -d), 0);
  let n;
  if (div === 3 || div === 9) {
    n = RI(100000, 999999);
    const rem = digitSum(n) % div;
    if (yes) { const need = (div - rem) % div; n += need === 0 ? 0 : need; if (n % 10 === 0) n += div; }
    else { if (rem === 0) n += 1; }
  } else if (div === 4) {
    const tail = yes ? R([12, 16, 24, 32, 44, 52, 68, 76, 88, 96]) : R([13, 18, 22, 26, 33, 42, 54, 58, 62, 74]);
    n = RI(100, 999) * 100 + tail;
  } else {
    n = RI(100000, 999999);
    let rem = altSum(n) % 11;
    for (let guard = 0; guard < 200 && (yes ? rem !== 0 : rem === 0); guard++) {
      n = RI(100000, 999999); rem = ((altSum(n) % 11) + 11) % 11;
    }
  }
  const why = div === 3 || div === 9
    ? `Digit sum of ${fmt(n)} is ${digitSum(n)}. ${digitSum(n)} is ${digitSum(n) % div === 0 ? '' : 'NOT '}divisible by ${div}.`
    : div === 4 ? `Last two digits are ${String(n).slice(-2)}. ${+String(n).slice(-2)} is ${+String(n).slice(-2) % 4 === 0 ? '' : 'NOT '}divisible by 4.`
    : `Alternating digit sum of ${fmt(n)} is ${altSum(n)} — ${((altSum(n) % 11) + 11) % 11 === 0 ? '' : 'NOT '}a multiple of 11.`;
  const isYes = div === 3 || div === 9 ? digitSum(n) % div === 0 : div === 4 ? +String(n).slice(-2) % 4 === 0 : ((altSum(n) % 11) + 11) % 11 === 0;
  const { options, answer } = mkOptions(isYes ? 'Yes' : 'No', [isYes ? 'No' : 'Yes', 'Yes, only if it ends in 0', 'Cannot be checked']);
  return { text: `Is the number ${fmt(n)} divisible by ${div}?`, options, answer,
    solution: [why, `So the answer is ${isYes ? 'YES' : 'NO'}.`],
    wrongWhy: null, signature: `div${div}-${n}`,
    tests: `Divisibility rule for ${div}.`,
    recall: div === 4 ? '4 → check last TWO digits.' : div === 11 ? '11 → alternating digit sum.' : `${div} → check the digit sum.`,
    memory: { tech: 'Rule ladder', x: '2,4,8 check 1/2/3 end digits; 3,9 check digit sum; 11 checks alternating sum.' } };
}),

gen('g-ns-prime', 'Prime or not', 'number-system', { conceptId: 'm-ns-primes', difficulty: 2 }, () => {
  const primes = [53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173];
  const fakes = [51, 57, 87, 91, 119, 121, 123, 133, 143, 161, 169, 171, 187, 203, 209, 217, 219, 221, 247, 253, 299];
  const askNot = Math.random() < 0.5;
  const correct = askNot ? R(fakes) : R(primes);
  const others = [];
  const pool = askNot ? primes : fakes;
  while (others.length < 3) { const v = R(pool); if (v !== correct && !others.includes(v)) others.push(v); }
  const { options, answer } = mkOptions(correct, others);
  const factors = { 51: '3×17', 57: '3×19', 87: '3×29', 91: '7×13', 119: '7×17', 121: '11×11', 123: '3×41', 133: '7×19', 143: '11×13', 161: '7×23', 169: '13×13', 171: '3×57', 187: '11×17', 203: '7×29', 209: '11×19', 217: '7×31', 219: '3×73', 221: '13×17', 247: '13×19', 253: '11×23', 299: '13×23' };
  return { text: `Which of the following is ${askNot ? 'NOT' : ''} a prime number?`.replace('  ', ' '), options, answer,
    solution: [`${correct} = ${askNot ? factors[correct] || 'composite' : 'prime — no divisor up to its square root'}.`],
    wrongWhy: null, signature: `prime${askNot}-${correct}`,
    tests: 'Prime number identification.', recall: 'Test divisibility by primes up to √n.',
    memory: { tech: 'Fake-prime list', x: '51, 57, 87, 91, 119, 121, 133 are the classic traps.' } };
}),

/* ---------- BODMAS ---------- */
gen('g-bodmas', 'BODMAS simplification', 'bodmas', { conceptId: 'm-bodmas-1', difficulty: 1 }, () => {
  const a = RI(10, 40), b = RI(2, 9), c = RI(2, 9), d = RI(2, 24), e = R([2, 3, 4]);
  const correct = a - b * c + d / e;
  const ltr = (a - b) * c + d / e;
  const addFirst = a - b * c + (d / e + b);
  const { options, answer } = mkOptions(Math.round(correct * 100) / 100, [Math.round(ltr * 100) / 100, Math.round(addFirst * 100) / 100, b * c + d], (x) => String(x));
  return { text: `Simplify: ${a} − ${b} × ${c} + ${d} ÷ ${e}`, options, answer,
    solution: [`× and ÷ first: ${b} × ${c} = ${b * c}; ${d} ÷ ${e} = ${d / e}.`, `Now: ${a} − ${b * c} + ${d / e} = ${Math.round(correct * 100) / 100}.`],
    wrongWhy: null, signature: `bod-${a}${b}${c}${d}${e}`,
    tests: 'Order of operations.', recall: '× ÷ before + −, then left to right.',
    memory: { tech: 'Word hook', x: 'BODMAS order is itself the memory method.' } };
}),

/* ---------- DECIMALS ---------- */
gen('g-dec-add', 'Decimal addition', 'decimals', { conceptId: 'm-dec-1', difficulty: 1 }, () => {
  const a = RI(1, 20) + R([0.25, 0.5, 0.75]), b = RI(1, 20) + R([0.25, 0.5, 0.75]);
  const correct = Math.round((a + b) * 100) / 100;
  const { options, answer } = mkOptions(correct, [Math.round((a + b) * 10) / 10, correct + 1, correct - 0.5, Math.round(a * b * 100) / 100]);
  return { text: `Add: ${a} + ${b}`, options, answer,
    solution: [`Line up the decimal points.`, `${a} + ${b} = ${correct}.`],
    wrongWhy: null, signature: `dec-${a}-${b}`,
    tests: 'Decimal addition.', recall: 'Points in one column, then add.',
    memory: { tech: 'Magnet point', x: 'The point is a magnet — line them up.' } };
}),

/* ---------- FRACTIONS ---------- */
gen('g-fr-add', 'Fraction addition', 'fractions', { conceptId: 'm-fr-3', difficulty: 2 }, () => {
  const pairs = [[2, 3, 1, 6], [1, 2, 1, 3], [3, 4, 1, 6], [2, 5, 3, 10], [1, 4, 1, 6], [5, 6, 1, 4], [3, 8, 1, 4], [2, 3, 3, 4], [1, 5, 1, 10], [3, 5, 1, 2], [7, 8, 1, 4], [1, 3, 1, 4]];
  const [a, b, c, d] = R(pairs);
  const gcd2 = (x, y) => { while (y) { [x, y] = [y, x % y]; } return x; };
  const lcm = b * d / gcd2(b, d);
  const n2 = a * (lcm / b) + c * (lcm / d);
  const correct = `${n2}/${lcm}`;
  const { options, answer } = mkOptions(correct, [`${a + c}/${b + d}`, `${a * c}/${b * d}`, `${n2 + 1}/${lcm}`]);
  return { text: `Add: ${a}/${b} + ${c}/${d}`, options, answer,
    solution: [`LCM of ${b} and ${d} = ${lcm}.`, `${a}/${b} = ${a * (lcm / b)}/${lcm}; ${c}/${d} = ${c * (lcm / d)}/${lcm}.`, `Sum = ${n2}/${lcm}.`],
    wrongWhy: null, signature: `fr-${a}${b}${c}${d}`,
    tests: 'Adding unlike fractions.', recall: 'LCM first, add tops only.',
    memory: { tech: 'Same-size slices', x: 'Convert to equal slices before adding.' } };
}),

/* ---------- LCM / HCF ---------- */
gen('g-lcm', 'LCM word problem', 'lcm', { conceptId: 'm-lcm-1', difficulty: 2 }, () => {
  const ctx = [
    (l) => [`Two bells ring every ${A} seconds and every ${B} seconds. If they ring together now, after how many seconds will they ring together again?`, 'bells'],
    (l) => [`Two buses leave the same stop every ${A} minutes and every ${B} minutes. If they leave together now, after how many minutes do they leave together again?`, 'buses'],
    (l) => [`Two bulbs blink every ${A} seconds and every ${B} seconds. They blink together now — after how many seconds will they blink together again?`, 'bulbs'],
  ];
  const gcd = (x, y) => { while (y) { [x, y] = [y, x % y]; } return x; };
  const A = R([4, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24]);
  let B = R([4, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24]);
  if (B === A) B = A + 2;
  const l = A * B / gcd(A, B);
  const [text] = R(ctx)(l);
  const { options, answer } = mkOptions(l, [A + B, A * B, l / 2, l * 2].filter(v => v !== l));
  return { text, options, answer,
    solution: [`This is an LCM question — the first common multiple.`, `LCM(${A}, ${B}) = ${l}.`],
    wrongWhy: null, signature: `lcm-${A}-${B}`,
    tests: 'LCM in a real situation.', recall: '“Together again” = LCM.',
    memory: { tech: 'Meeting point', x: 'LCM = first meeting point of two multiplication tables.' } };
}),

gen('g-hcf', 'HCF word problem', 'hcf', { conceptId: 'm-hcf-1', difficulty: 2 }, () => {
  const gcd = (x, y) => { while (y) { [x, y] = [y, x % y]; } return x; };
  const h = R([4, 6, 8, 10, 12, 14, 15]);
  const m1 = R([2, 3, 4, 5]), m2 = R([2, 3, 4, 5]);
  const A = h * m1, B = h * m2;
  const correct = gcd(A, B);
  const { options, answer } = mkOptions(correct, [correct * 2, Math.max(m1, m2), A + B - correct].filter(v => v > 0));
  return { text: `Find the GREATEST number that divides both ${A} and ${B} exactly (leaving no remainder).`, options, answer,
    solution: [`“Greatest that divides both” = HCF.`, `${A} and ${B} have HCF = ${correct}.`],
    wrongWhy: null, signature: `hcf-${A}-${B}`,
    tests: 'HCF recognition.', recall: '“Greatest that divides” = HCF.',
    memory: { tech: 'Keyword hook', x: 'Greatest + divides → HCF. Smallest + divisible → LCM.' } };
}),

/* ---------- RATIO ---------- */
gen('g-ratio', 'Divide in ratio', 'ratio-proportion', { conceptId: 'm-rp-1', difficulty: 2 }, () => {
  const a = R([2, 3, 4, 5]), b = R([3, 4, 5, 6, 7]);
  const unit = R([20, 40, 60, 80, 100, 120, 150]);
  const total = (a + b) * unit;
  const askB = Math.random() < 0.5;
  const correct = (askB ? b : a) * unit;
  const ctx = R([
    (v) => `₹${fmt(total)} is divided between A and B in the ratio ${a} : ${b}. Find ${askB ? 'B’s' : 'A’s'} share.`,
    (v) => `Two partners invest in the ratio ${a} : ${b} out of a total of ₹${fmt(total)}. How much does ${askB ? 'the second' : 'the first'} partner invest?`,
  ]);
  const { options, answer } = mkOptions(rupee(correct), [rupee(a * b * unit / Math.max(a, b)), rupee(total - correct), rupee(unit * (askB ? a : b) * 2), rupee(unit)].filter(v => v !== rupee(correct)));
  return { text: ctx(), options, answer,
    solution: [`Total parts = ${a} + ${b} = ${a + b}.`, `One part = ${fmt(total)} ÷ ${a + b} = ${fmt(unit)}.`, `${askB ? 'B' : 'A'} gets ${askB ? b : a} × ${fmt(unit)} = ${rupee(correct)}.`],
    wrongWhy: null, signature: `ratio-${a}${b}${unit}${askB}`,
    tests: 'Dividing a quantity in a given ratio.', recall: 'One part = total ÷ parts.',
    memory: { tech: 'Formula pattern', x: 'Sum → parts → one part → shares.' } };
}),

/* ---------- MENSURATION ---------- */
gen('g-me-rect', 'Rectangle area/perimeter', 'mensuration', { conceptId: 'm-me-1', difficulty: 1 }, () => {
  const l = RI(6, 30), b = RI(4, 20);
  const askArea = Math.random() < 0.5;
  const correct = askArea ? l * b : 2 * (l + b);
  const unit = askArea ? 'm²' : 'm';
  const ctx = R([
    `A rectangular hall is ${l} m long and ${b} m wide. Find its ${askArea ? 'area' : 'perimeter'}.`,
    `A garden is ${l} m by ${b} m. A worker ${askArea ? 'tiles the whole floor' : 'fences the boundary'}. What measurement does he need (${askArea ? 'area' : 'perimeter'})?`,
  ]);
  const { options, answer } = mkOptions(`${fmt(correct)} ${unit}`, [`${fmt(askArea ? 2 * (l + b) : l * b)} ${askArea ? 'm²' : 'm'}`, `${fmt(l + b)} ${unit}`, `${fmt((askArea ? l * b : 2 * (l + b)) * 2)} ${unit}`]);
  return { text: ctx, options, answer,
    solution: askArea ? [`Area = l × b = ${l} × ${b} = ${l * b} m².`] : [`Perimeter = 2(l + b) = 2(${l} + ${b}) = ${2 * (l + b)} m.`],
    wrongWhy: null, signature: `rect-${l}-${b}-${askArea}`,
    tests: askArea ? 'Area of a rectangle.' : 'Perimeter of a rectangle.', recall: 'Area lb, perimeter 2(l+b).',
    memory: { tech: 'Walk vs paint', x: 'Around → perimeter; inside → area.' } };
}),

/* ---------- TIME AND WORK ---------- */
gen('g-tw', 'Time and work together', 'time-work', { conceptId: 'm-tw-1', difficulty: 2 }, () => {
  const pairs = [[8, 12], [10, 15], [12, 18], [9, 18], [20, 30], [6, 12], [15, 10], [12, 24], [18, 9], [24, 8]];
  const [a, b] = R(pairs);
  const t = (a * b) / (a + b);
  const tStr = Number.isInteger(t) ? `${t} days` : `${t} days`;
  const { options, answer } = mkOptions(tStr, [`${(a + b) / 2} days`, `${a + b} days`, `${Math.abs(a - b)} days`, `${t + 1} days`].filter(x => x !== tStr));
  const ctx = R([
    `A can finish a work in ${a} days and B can finish it in ${b} days. Working together, how many days will they take?`,
    `Pipe A fills a tank in ${a} hours and pipe B in ${b} hours. How long if both are open?`,
  ]);
  return { text: ctx, options, answer,
    solution: [`Rates: 1/${a} + 1/${b} = ${b}/${a * b} + ${a}/${a * b} = ${a + b}/${a * b} per day.`, `Time = ${a * b}/${a + b} = ${t} ${ctx.includes('Pipe') ? 'hours' : 'days'}.`],
    wrongWhy: null, signature: `tw-${a}-${b}`,
    tests: 'One-day work method (together).', recall: 'Together = ab/(a+b).',
    memory: { tech: 'Tanglish LMD', x: 'Last Munnadi Divide: add rates then flip.' } };
}),

/* ---------- TIME AND DISTANCE ---------- */
gen('g-td', 'Speed / distance / time', 'time-distance', { conceptId: 'm-td-1', difficulty: 2 }, () => {
  const mode = RI(1, 3);
  if (mode === 1) {
    const s = R([40, 45, 50, 60, 72, 80, 90]), t = R([2, 2.5, 3, 4, 1.5]);
    const d = s * t;
    const { options, answer } = mkOptions(`${fmt(d)} km`, [`${fmt(s + t)} km`, `${fmt(d / 2)} km`, `${fmt(d * 1.5)} km`]);
    return { text: `A ${R(['car', 'bus', 'train'])} travels at ${s} km/h for ${t} hours. How far does it go?`, options, answer,
      solution: [`Distance = Speed × Time = ${s} × ${t} = ${fmt(d)} km.`],
      wrongWhy: null, signature: `td1-${s}-${t}`, tests: 'D = S × T.', recall: 'D = S×T.',
      memory: { tech: 'Triangle', x: 'Cover D in D = S×T.' } };
  }
  if (mode === 2) {
    const s = R([36, 54, 72, 90, 108]);
    const ms = s * 5 / 18;
    const { options, answer } = mkOptions(`${ms} m/s`, [`${s / 2} m/s`, `${s} m/s`, `${ms + 2} m/s`]);
    return { text: `Convert ${s} km/h into m/s.`, options, answer,
      solution: [`${s} × 5/18 = ${ms} m/s.`],
      wrongWhy: null, signature: `td2-${s}`, tests: 'Unit conversion.', recall: 'km/h → m/s: ×5/18.',
      memory: { tech: 'If X then Y', x: 'If km/h, multiply 5/18 to get m/s.' } };
  }
  const d = R([120, 150, 180, 240, 300]), s1 = R([40, 60, 80]);
  let s2 = R([30, 40, 50, 60]); if (s2 === s1) s2 = s1 - 10;
  const t1 = d / s1, t2 = d / s2, avg = 2 * d / (t1 + t2);
  const { options, answer } = mkOptions(`${Math.round(avg * 100) / 100} km/h`, [`${(s1 + s2) / 2} km/h`, `${Math.round(avg + 2)} km/h`, `${s1} km/h`]);
  return { text: `A man drives ${d} km at ${s1} km/h and returns the same distance at ${s2} km/h. Find his average speed for the whole trip.`, options, answer,
    solution: [`Times: ${d}/${s1} = ${t1} h and ${d}/${s2} = ${t2} h.`, `Total ${2 * d} km in ${Math.round((t1 + t2) * 100) / 100} h.`, `Average = total ÷ total = ${Math.round(avg * 100) / 100} km/h.`],
    wrongWhy: null, signature: `td3-${d}-${s1}-${s2}`, tests: 'Average speed (total/total).', recall: 'Average = total distance ÷ total time.',
    memory: { tech: 'If X then Y', x: 'If distances are equal, average is NEVER the simple mean of speeds.' } };
}),

/* ---------- SIMPLE INTEREST ---------- */
gen('g-si', 'Simple interest', 'simple-interest', { conceptId: 'm-si-1', methodId: 'si-basic', difficulty: 2 }, () => {
  const P = R([2000, 4000, 5000, 6000, 8000, 10000, 12000, 15000]);
  const Rt = R([4, 5, 6, 8, 10, 12]);
  const T = R([2, 2.5, 3, 4, 5]);
  const si = P * Rt * T / 100;
  const { options, answer } = mkOptions(rupee(si), [rupee(si * 2), rupee(si / 2), rupee(P * Rt / 100)]);
  return { text: `Find the simple interest on ${rupee(P)} at ${Rt}% per year for ${T} years.`, options, answer,
    solution: [`SI = P×R×T/100 = ${P}×${Rt}×${T}/100.`, `SI = ${rupee(si)}.`],
    wrongWhy: null, signature: `si-${P}-${Rt}-${T}`,
    tests: 'SI = PRT/100.', recall: 'SI = PRT/100.',
    memory: { tech: 'PRT story', x: '“Pandi Ran Two” — P, R, T multiplied ÷100.' } };
}),

/* ---------- COMPOUND INTEREST ---------- */
gen('g-ci', 'Compound interest (2 years)', 'compound-interest', { conceptId: 'm-ci-1', difficulty: 2 }, () => {
  const P = R([5000, 8000, 10000, 20000, 25000]);
  const r = R([5, 10, 20]);
  const A = P * (1 + r / 100) ** 2;
  const ci = A - P;
  const { options, answer } = mkOptions(rupee(ci), [rupee(P * r * 2 / 100), rupee(A), rupee(ci + P * r / 100)]);
  return { text: `Find the compound interest on ${rupee(P)} at ${r}% per year, compounded annually, for 2 years.`, options, answer,
    solution: [`A = P(1+r/100)² = ${P} × ${(1 + r / 100).toFixed(2)}² = ${rupee(A)}.`, `CI = A − P = ${rupee(ci)}.`, `(Simple interest would be only ${rupee(P * r * 2 / 100)} — CI is more.)`],
    wrongWhy: null, signature: `ci-${P}-${r}`,
    tests: 'CI amount formula.', recall: 'A = P(1+r/100)ᵀ; CI = A−P.',
    memory: { tech: 'Snowball', x: 'CI grows on a growing base.' } };
}),

/* ---------- PROFIT AND LOSS ---------- */
gen('g-pl', 'Profit or loss percent', 'profit-loss', { conceptId: 'm-pl-1', methodId: 'pl-basic', difficulty: 2 }, () => {
  const cp = R([200, 250, 400, 500, 600, 800, 1000, 1200, 1500]);
  const pct = R([10, 15, 20, 25]);
  const profit = Math.random() < 0.6;
  const sp = profit ? cp * (100 + pct) / 100 : cp * (100 - pct) / 100;
  const correct = `${pct}% ${profit ? 'profit' : 'loss'}`;
  const { options, answer } = mkOptions(correct, [`${pct}% ${profit ? 'loss' : 'profit'}`, `${pct + 5}% ${profit ? 'profit' : 'loss'}`, `No profit, no loss`, `${Math.round(pct * cp / (profit ? sp : cp))}% ${profit ? 'profit' : 'loss'}`]);
  const item = R(['a fan', 'a table', 'a mobile phone', 'a cycle', 'a TV']);
  return { text: `A shopkeeper buys ${item} for ${rupee(cp)} and sells it for ${rupee(sp)}. Find his profit or loss percentage.`, options, answer,
    solution: [`${profit ? 'SP > CP → profit' : 'CP > SP → loss'} of ${rupee(Math.abs(sp - cp))}.`, `Percent is always on CP: ${Math.abs(sp - cp)}/${cp} × 100 = ${pct}%.`],
    wrongWhy: null, signature: `pl-${cp}-${pct}-${profit}`,
    tests: 'Profit/loss % on CP.', recall: '(SP−CP)/CP × 100.',
    memory: { tech: 'Cause → effect', x: 'Percent always measured from the CP (the cause).' } };
}),

/* ---------- ALGEBRA ---------- */
gen('g-al', 'Solve linear equation', 'algebra', { conceptId: 'm-al-1', difficulty: 1 }, () => {
  const x = RI(2, 15), a = RI(2, 9), b = RI(1, 20);
  const c = a * x + b;
  const { options, answer } = mkOptions(x, [x + 1, x - 1, c - b]);
  return { text: `Solve for x:  ${a}x + ${b} = ${c}`, options, answer,
    solution: [`${a}x = ${c} − ${b} = ${c - b}.`, `x = ${c - b} ÷ ${a} = ${x}.`, `Check: ${a}×${x} + ${b} = ${c} ✓.`],
    wrongWhy: null, signature: `al-${a}-${b}-${x}`,
    tests: 'Simple linear equation.', recall: 'Undo + first, then undo ×.',
    memory: { tech: 'Balance', x: 'Same operation on both sides.' } };
}),

/* ---------- GEOMETRY ---------- */
gen('g-ge-tri', 'Third angle of a triangle', 'geometry', { conceptId: 'm-ge-1', difficulty: 1 }, () => {
  const a1 = RI(20, 80); let a2 = RI(20, 80);
  const a3 = 180 - a1 - a2;
  const { options, answer } = mkOptions(`${a3}°`, [`${180 - a1}°`, `${a1 + a2}°`, `${360 - a1 - a2}°`, `${a3 + 10}°`]);
  return { text: `Two angles of a triangle are ${a1}° and ${a2}°. Find the third angle.`, options, answer,
    solution: [`Sum of angles = 180°.`, `Third = 180 − ${a1} − ${a2} = ${a3}°.`],
    wrongWhy: null, signature: `tri-${a1}-${a2}`,
    tests: 'Angle sum property.', recall: 'Triangle = 180°.',
    memory: { tech: 'Trinity roti', x: 'Three angles share one 180° roti.' } };
}),

/* ---------- STATISTICS ---------- */
gen('g-st-mean', 'Mean of numbers', 'statistics', { conceptId: 'm-st-1', difficulty: 1 }, () => {
  const n = 5, mean = RI(4, 30);
  const nums = Array.from({ length: n }, () => RI(1, mean * 2));
  const diff = nums.reduce((a, b) => a + b, 0) - mean * n;
  nums[0] -= diff;
  if (nums[0] < 0) { nums[0] += Math.abs(nums[0]) + 2; nums[1] -= Math.abs(diff) + 2; }
  const sum = nums.reduce((a, b) => a + b, 0);
  const correct = sum / n;
  const { options, answer } = mkOptions(correct, [correct + 1, correct - 2, Math.max(...nums)]);
  return { text: `Find the mean of: ${nums.join(', ')}`, options, answer,
    solution: [`Sum = ${sum}.`, `Count = ${n}.`, `Mean = ${sum} ÷ ${n} = ${correct}.`],
    wrongWhy: null, signature: `mean-${nums.join('')}`,
    tests: 'Mean = sum ÷ count.', recall: 'Sum ÷ count.',
    memory: { tech: 'Equal share', x: 'Mean = share the total equally.' } };
}),

gen('g-st-median', 'Median of numbers', 'statistics', { conceptId: 'm-st-1', difficulty: 1 }, () => {
  const nums = Array.from({ length: 5 }, () => RI(1, 40));
  const sorted = [...nums].sort((a, b) => a - b);
  const correct = sorted[2];
  const { options, answer } = mkOptions(correct, [nums[2], sorted[3], Math.max(...nums), sorted[1]]);
  return { text: `Find the median of: ${nums.join(', ')}`, options, answer,
    solution: [`Sort first: ${sorted.join(', ')}.`, `Middle value (3rd of 5) = ${correct}.`],
    wrongWhy: null, signature: `med-${nums.join('')}`,
    tests: 'Median after sorting.', recall: 'Sort, then take the middle.',
    memory: { tech: 'Queue middle', x: 'Median = the middle man of the sorted queue.' } };
}),

/* ---------- SQUARE ROOT ---------- */
gen('g-sr', 'Square root of a perfect square', 'square-root', { conceptId: 'm-sr-1', difficulty: 2 }, () => {
  const roots = [15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 34, 35, 36, 38, 39, 41, 42, 44, 45, 46, 48, 49, 55];
  const r = R(roots), sq = r * r;
  const { options, answer } = mkOptions(r, [r + 1, r - 1, Math.round(sq / 10)]);
  return { text: `Find the value of √${fmt(sq)}.`, options, answer,
    solution: [`${r} × ${r} = ${fmt(sq)}.`, `So √${fmt(sq)} = ${r}.`],
    wrongWhy: null, signature: `sr-${r}`,
    tests: 'Perfect squares.', recall: 'Learn squares up to 25².',
    memory: { tech: 'Ending trick', x: 'Squares end only in 0,1,4,5,6,9.' } };
}),

/* ---------- AGE ---------- */
gen('g-age', 'Age problem', 'age-calculations', { conceptId: 'm-age-1', difficulty: 2 }, () => {
  const fam = [
    { k: 3, m: 2, nOf: (s) => s },      // after s years: 2x
    { k: 4, m: 2, nOf: (s) => 2 * s },  // after 2s years: 2x
    { k: 5, m: 3, nOf: (s) => s },      // after s years: 3x
  ];
  const f = R(fam);
  const s = R([5, 8, 10, 12, 15]);
  const n = f.nOf(s);
  const father = f.k * s;
  const correct = s;
  const { options, answer } = mkOptions(correct, [father, s + n, father / 2]);
  const who = R([['father', 'son'], ['mother', 'daughter']]);
  return { text: `A ${who[0]}'s present age is ${f.k} times his ${who[1]}'s age. After ${n} years, the ${who[0]} will be ${f.m} times as old as the ${who[1]}. Find the ${who[1]}'s present age.`, options, answer,
    solution: [`${who[1]} = x, ${who[0]} = ${f.k}x.`, `After ${n} years: ${f.k}x + ${n} = ${f.m}(x + ${n}).`, `${f.k}x + ${n} = ${f.m}x + ${f.m * n} → ${f.k - f.m}x = ${(f.m - 1) * n} → x = ${s}.`, `Check: ${who[0]} = ${father}; after ${n} years → ${father + n} vs ${s + n} = ${Math.round((father + n) / (s + n))}× ✓.`],
    wrongWhy: null, signature: `age-${f.k}-${f.m}-${s}`,
    tests: 'Age equations.', recall: 'Present = x; years move for everyone.',
    memory: { tech: 'Time train', x: 'Everyone boards the same time train.' } };
}),

/* ---------- CLOCK ---------- */
gen('g-clk', 'Clock angle', 'calendar-clock', { conceptId: 'm-clk-1', difficulty: 2 }, () => {
  const H = RI(1, 12), M = R([10, 20, 30, 40, 50]);
  let ang = Math.abs(30 * (H % 12) - 5.5 * M);
  if (ang > 180) ang = 360 - ang;
  const { options, answer } = mkOptions(`${ang}°`, [`${Math.abs(30 * (H % 12) - 6 * M)}°`, `${360 - ang}°`, `${ang + 15}°`]);
  return { text: `Find the angle between the hands of a clock at ${H}:${String(M).padStart(2, '0')}.`, options, answer,
    solution: [`30H = ${30 * (H % 12)}.`, `5.5M = ${5.5 * M}.`, `Angle = |${30 * (H % 12)} − ${5.5 * M}| = ${Math.abs(30 * (H % 12) - 5.5 * M)}°${Math.abs(30 * (H % 12) - 5.5 * M) > 180 ? ` → smaller angle = 360 − ${Math.abs(30 * (H % 12) - 5.5 * M)} = ${ang}°` : ''}.`],
    wrongWhy: null, signature: `clk-${H}-${M}`,
    tests: 'Clock angle formula.', recall: '|30H − 5.5M|.',
    memory: { tech: 'Speed pair', x: 'Gap changes 5.5°/min.' } };
}),

/* ---------- PIPES ---------- */
gen('g-pc', 'Pipes together', 'pipes-cistern', { conceptId: 'm-pc-1', difficulty: 2 }, () => {
  const pairs = [[6, 12], [8, 12], [10, 15], [12, 18], [15, 10], [20, 30], [4, 12], [9, 18], [6, 9]];
  const [a, b] = R(pairs);
  const withDrain = Math.random() < 0.4;
  if (withDrain) {
    const dbl = a * 2;
    const net = 1 / a - 1 / dbl;
    const t = Math.round(1 / net);
    const { options, answer } = mkOptions(`${t} hours`, [`${a + dbl} hours`, `${t / 2} hours`, `${dbl - a} hours`]);
    return { text: `Pipe A fills a tank in ${a} hours, but a drain at the bottom can empty the FULL tank in ${dbl} hours. Both are open — how long to fill the tank?`, options, answer,
      solution: [`Net rate = 1/${a} − 1/${dbl} = ${dbl - a}/${a * dbl} = 1/${t} per hour.`, `Time = ${t} hours.`],
      wrongWhy: null, signature: `pc-d-${a}-${dbl}`,
      tests: 'Fill minus drain.', recall: 'Drain is negative work.',
      memory: { tech: 'Tanglish sign', x: 'Vaa (+) pora (−).' } };
  }
  const t = (a * b) / (a + b);
  const { options, answer } = mkOptions(`${t} hours`, [`${(a + b) / 2} hours`, `${a + b} hours`, `${t + 1} hours`].filter(x => x !== `${t} hours`));
  return { text: `Pipe A fills a tank in ${a} hours and pipe B fills it in ${b} hours. How long will they take together?`, options, answer,
    solution: [`1/${a} + 1/${b} = ${a + b}/${a * b} per hour.`, `Time = ${a * b}/${a + b} = ${t} hours.`],
    wrongWhy: null, signature: `pc-${a}-${b}`,
    tests: 'Two filling pipes.', recall: 'Together = ab/(a+b).',
    memory: { tech: 'LMD', x: 'Rates add, then flip.' } };
}),

/* ============================================================
   PERCENTAGE MODEL GENERATORS — the 7 models of the Method Trainer
   (spec §7 example sequence lives in g-pct-inc contexts)
   ============================================================ */
gen('g-pct-of', 'Model 1: Find x% of a number', 'percentages', { conceptId: 'm-pct-1', methodId: 'pct-of', difficulty: 1 }, () => {
  const x = R([5, 10, 15, 20, 25, 30, 35, 40, 45, 60, 75]);
  const N = R([200, 240, 300, 400, 480, 500, 600, 800, 1000, 1200, 1600, 2000]);
  const v = x * N / 100;
  const ctx = R([
    `In a class of ${N} students, ${x}% play cricket. How many students play cricket?`,
    `A factory produced ${N} items and ${x}% of them failed inspection. How many failed?`,
    `What is ${x}% of ${fmt(N)}?`,
    `A town has ${fmt(N)} people and ${x}% are children. How many children are there?`,
  ]);
  const { options, answer } = mkOptions(fmt(v), [fmt(v * 2), fmt(v / 2), fmt(x * 10), fmt(v + 10)]);
  return { text: ctx, options, answer,
    solution: [`${x}% of ${fmt(N)} = ${x}/100 × ${fmt(N)}.`, `= ${fmt(v)}.`],
    wrongWhy: null, signature: `pof-${x}-${N}`,
    tests: 'Model 1 — x% of a number.', recall: 'x% of N = x/100 × N.',
    memory: { tech: '10% blocks', x: `10% of ${fmt(N)} = ${fmt(N / 10)} — build the answer from blocks.` } };
}),

gen('g-pct-inc', 'Model 2: Percentage increase', 'percentages', { conceptId: 'm-pct-2', methodId: 'pct-increase', difficulty: 1 }, () => {
  const ctxs = [
    ['the price of an item', rupee], ['a salary', rupee], ['the population of a town', (n) => fmt(n)],
    ['the monthly rent', rupee], ['the number of students in a school', (n) => fmt(n)], ['the fare of a bus route', rupee],
  ];
  const [what, f] = R(ctxs);
  const oldV = R([500, 800, 1000, 2000, 4000, 5000, 8000, 12000, 15000, 20000]);
  const r = R([5, 10, 15, 20, 25, 50]);
  if ((oldV * r) % 100 !== 0) { /* keep integers */ }
  const inc = oldV * r / 100;
  const newV = oldV + inc;
  const { options, answer } = mkOptions(f(newV), [f(oldV + r), f(inc), f(oldV), f(newV + inc)]);
  return { text: `${what[0].toUpperCase() + what.slice(1)} is ${f(oldV)} and it increases by ${r}%. Find the new value.`, options, answer,
    solution: [`New = Old × (100 + ${r})/100 = ${oldV} × ${(100 + r) / 100}.`, `New = ${f(newV)}.`],
    wrongWhy: null, signature: `pinc-${oldV}-${r}`,
    tests: 'Model 2 — percentage increase.', recall: 'New = Old × (100+r)/100.',
    memory: { tech: 'Multiplier', x: `+${r}% means × ${(100 + r) / 100}.` } };
}),

gen('g-pct-dec', 'Model 3: Percentage decrease', 'percentages', { conceptId: 'm-pct-2', methodId: 'pct-decrease', difficulty: 1 }, () => {
  const ctxs = [
    ['the price of a phone', rupee], ['a salary', rupee], ['the population of a village', (n) => fmt(n)],
    ['the water level in a tank (litres)', (n) => fmt(n) + ' L'], ['the number of visitors', (n) => fmt(n)],
  ];
  const [what, f] = R(ctxs);
  const oldV = R([400, 500, 800, 1000, 2000, 4000, 6000, 8000, 10000, 16000]);
  const r = R([5, 10, 15, 20, 25, 50]);
  const dec = oldV * r / 100;
  const newV = oldV - dec;
  const { options, answer } = mkOptions(f(newV), [f(oldV - r), f(dec), f(oldV), f(newV - dec)]);
  return { text: `${what[0].toUpperCase() + what.slice(1)} is ${f(oldV)} and it decreases by ${r}%. Find the new value.`, options, answer,
    solution: [`New = Old × (100 − ${r})/100 = ${oldV} × ${(100 - r) / 100}.`, `New = ${f(newV)}.`],
    wrongWhy: null, signature: `pdec-${oldV}-${r}`,
    tests: 'Model 3 — percentage decrease.', recall: 'New = Old × (100−r)/100.',
    memory: { tech: 'Multiplier', x: `−${r}% means × ${(100 - r) / 100}.` } };
}),

gen('g-pct-rev', 'Model 4: Reverse percentage', 'percentages', { conceptId: 'm-pct-2', methodId: 'pct-rev', difficulty: 2 }, () => {
  const inc = Math.random() < 0.6;
  const r = R([20, 25, 50]);
  const orig = R([200, 400, 500, 800, 1000, 2000, 4000, 5000, 8000]);
  const now = inc ? orig * (100 + r) / 100 : orig * (100 - r) / 100;
  const f = (n) => rupee(n);
  const { options, answer } = mkOptions(f(orig), [f(now), f(orig + r), f(now / 2), f(orig / 2)]);
  const what = R(['the price of an item', 'a salary', 'the value of a machine', 'the fee of a course']);
  return { text: `After a ${r}% ${inc ? 'increase' : 'decrease'}, ${what} became ${f(now)}. What was the original value?`, options, answer,
    solution: [`Original = New × 100/${inc ? 100 + r : 100 - r}.`, `= ${now} × 100/${inc ? 100 + r : 100 - r} = ${f(orig)}.`, `Check: ${f(orig)} ${inc ? '+' : '−'} ${r}% = ${f(now)} ✓.`],
    wrongWhy: null, signature: `prev-${orig}-${r}-${inc}`,
    tests: 'Model 4 — reverse percentage.', recall: `Original = New × 100/(100${inc ? '+' : '−'}r).`,
    memory: { tech: 'If X then Y', x: `If it became N after ${r}% ${inc ? 'increase' : 'decrease'}, divide — do not subtract.` } };
}),

gen('g-pct-succ', 'Model 5: Successive percentage', 'percentages', { conceptId: 'm-pct-2', methodId: 'pct-successive', difficulty: 3 }, () => {
  const pairs = [[10, 10], [10, 20], [20, 10], [20, 20], [10, 25], [25, 10], [20, 25], [25, 20], [10, 50], [50, 10], [20, 50], [50, 20]];
  const [a, b] = R(pairs);
  const net = a + b + a * b / 100;
  const up = Math.random() < 0.7;
  const correct = `${net}% ${up ? 'increase' : 'decrease'}`;
  const { options, answer } = mkOptions(correct, [`${a + b}% ${up ? 'increase' : 'decrease'}`, `${net + a}% ${up ? 'increase' : 'decrease'}`, `${Math.abs(a - b)}% ${up ? 'increase' : 'decrease'}`]);
  const what = R(['The price of a product', 'A city’s population', 'The value of an investment', 'A shop’s sales']);
  return { text: `${what} ${up ? 'increases' : 'decreases'} by ${a}% and then ${up ? 'increases' : 'decreases'} by ${b}%. What is the net percentage change?`, options, answer,
    solution: [`Net = a + b + ab/100 = ${a} + ${b} + ${a * b}/100.`, `= ${a} + ${b} + ${a * b / 100} = ${net}%.`],
    wrongWhy: null, signature: `succ-${a}-${b}-${up}`,
    tests: 'Model 5 — successive percentage.', recall: 'a + b + ab/100.',
    memory: { tech: 'Formula pattern', x: 'Add both rates plus their tiny product ab/100.' } };
}),

gen('g-pct-cmp', 'Model 6: Percentage comparison', 'percentages', { conceptId: 'm-pct-1', methodId: 'pct-compare', difficulty: 2 }, () => {
  const totals = [20, 25, 40, 50, 80, 200, 400, 500, 1000];
  const T = R(totals);
  const pct = R([20, 25, 40, 50, 60, 75, 80]);
  const M = T * pct / 100;
  const { options, answer } = mkOptions(`${pct}%`, [`${100 - pct}%`, `${Math.round(M / T * 100) + 10}%`, `${pct / 2}%`]);
  return { text: `A student scored ${fmt(M)} marks out of ${fmt(T)}. What is his percentage?`, options, answer,
    solution: [`Percentage = (part ÷ total) × 100.`, `= ${M}/${T} × 100 = ${pct}%.`],
    wrongWhy: null, signature: `cmp-${T}-${pct}`,
    tests: 'Model 6 — A as % of B.', recall: '(part ÷ total) × 100.',
    memory: { tech: 'If X then Y', x: 'If you see “out of”, divide and ×100.' } };
}),

gen('g-pct-err', 'Model 7: Error percentage', 'percentages', { conceptId: 'm-pct-2', methodId: 'pct-error', difficulty: 2 }, () => {
  const correctV = R([200, 250, 400, 500, 800, 1000, 1500, 2000]);
  const pct = R([5, 10, 20, 25]);
  const err = correctV * pct / 100;
  const wroteHigh = Math.random() < 0.5;
  const wrongV = correctV + (wroteHigh ? err : -err);
  const { options, answer } = mkOptions(`${pct}%`, [`${Math.round(err / wrongV * 100)}%`, `${pct * 2}%`, `${pct / 2}%`]);
  return { text: `The correct value was ${fmt(correctV)}, but a student wrote ${fmt(wrongV)} by mistake. What is the error percentage?`, options, answer,
    solution: [`Error = |${wrongV} − ${correctV}| = ${fmt(err)}.`, `Error% is on the CORRECT value: ${err}/${correctV} × 100 = ${pct}%.`],
    wrongWhy: null, signature: `err-${correctV}-${pct}-${wroteHigh}`,
    tests: 'Model 7 — error percentage.', recall: 'Error ÷ CORRECT × 100.',
    memory: { tech: 'Cause → effect', x: 'The correct value is the base (the truth), not the mistake.' } };
}),
];
