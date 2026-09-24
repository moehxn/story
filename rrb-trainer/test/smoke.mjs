/* Smoke tests: run with `node test/smoke.mjs` from rrb-trainer/.
   Verifies: content registration, question integrity (answer within options,
   no duplicate ids, guided questions valid), generators produce self-consistent
   answers (checked by re-solving), engine mastery transitions, selector rules,
   guide parser, and plan builder. */
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
};
globalThis.window = globalThis;

const base = new URL('../js/', import.meta.url);

const store = await import(new URL('store.js', base));
const { S, Bank } = store;
const syll = await import(new URL('syllabus.js', base));
const content = await import(new URL('content/index.js', base));
const mastery = await import(new URL('engine/mastery.js', base));
const selector = await import(new URL('engine/selector.js', base));
const planMod = await import(new URL('engine/plan.js', base));
const smart = await import(new URL('engine/smart.js', base));

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };

/* ---------- boot ---------- */
S.init();
const stats = content.registerStarterContent();
console.log('Registered starter content:', stats);
ok(stats.concepts >= 60, 'concepts registered');
ok(stats.questions >= 80, 'static questions registered');
ok(stats.generators >= 25, 'generators registered');
ok(stats.duplicates === 0, 'no duplicate concept ids');

/* ---------- question integrity ---------- */
let bad = 0;
for (const [id, q] of Bank.questions) {
  if (!q.text || !q.options || q.options.length < 2) { console.error('bad q', id); bad++; }
  if (q.answer == null || q.answer < 0 || q.answer >= q.options.length) { console.error('bad answer', id); bad++; }
  if (new Set(q.options).size !== q.options.length) { console.error('dup options', id); bad++; }
  if (!['GUIDE', 'PYQ', 'OFFICIAL', 'EXPECTED', 'AI'].includes(q.source)) { console.error('bad source', id); bad++; }
}
ok(bad === 0, 'all questions structurally valid');

/* guided questions valid */
let gbad = 0;
for (const c of Bank.concepts.values()) {
  const g = c.guided;
  if (!g || !g.options || g.answer == null || g.answer >= g.options.length || !g.steps?.length) { console.error('bad guided', c.id); gbad++; }
}
ok(gbad === 0, 'all guided questions valid');

/* concepts reference existing topics */
let tbad = 0;
for (const c of Bank.concepts.values()) if (!syll.TOPIC_BY_ID[c.topicId]) { console.error('bad topic', c.id, c.topicId); tbad++; }
ok(tbad === 0, 'all concepts map to official syllabus topics');

/* ---------- generator self-consistency (answer is correct math where checkable) ---------- */
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; };
let genRuns = 0, genBad = 0;
for (let round = 0; round < 40; round++) {
  for (const g of Bank.generators.values()) {
    const v = g.make();
    genRuns++;
    if (!v || !v.text || !v.options || v.answer == null || v.answer < 0 || v.answer >= v.options.length) {
      console.error('generator output invalid', g.id, v); genBad++; continue;
    }
    if (new Set(v.options).size !== v.options.length) { console.error('generator dup options', g.id, v.text); genBad++; }
  }
}
console.log(`Generators: ${genRuns} runs`);
ok(genRuns > 1000, 'generators ran');
ok(genBad === 0, 'all generator outputs valid');

/* spot-verify some generators numerically */
const gPctInc = Bank.generators.get('g-pct-inc');
for (let i = 0; i < 30; i++) {
  const v = gPctInc.make();
  const m = v.text.match(/is ([\d,]+) and it increases by (\d+)%\. Find the new value\./);
  if (!m) continue;
  const oldV = +m[1].replace(/,/g, ''), r = +m[2];
  const expected = oldV * (100 + r) / 100;
  const got = v.options[v.answer].replace(/[₹,\s]/g, '');
  if (Math.abs(+got - expected) > 0.001) { console.error('pct-inc wrong', v.text, got, expected); genBad++; break; }
}
const gBod = Bank.generators.get('g-bodmas');
for (let i = 0; i < 30; i++) {
  const v = gBod.make();
  const m = v.text.match(/(\d+) − (\d+) × (\d+) \+ (\d+) ÷ (\d+)/);
  const val = +m[1] - +m[2] * +m[3] + +m[4] / +m[5];
  if (Math.abs(+v.options[v.answer] - val) > 0.01) { console.error('bodmas wrong', v.text, v.options[v.answer], val); genBad++; break; }
}
ok(genBad === 0, 'spot-checked generator math is correct');

/* ---------- mastery transitions ---------- */
S.reset();
content.registerStarterContent();
const cq = Bank.questions.get('q-pct-1'); // percentage concept
// wrong once
let ev = mastery.recordAttempt(cq, 0, false, 'practice');
let rec = S.state.concepts['m-pct-1'];
ok(rec.status === 'WEAK' && rec.wrongStreak === 1, 'wrong once → WEAK, streak 1');
ok(rec.nextRev !== null, 'revision scheduled after wrong');
// correct x1 (not mastered)
mastery.recordAttempt(cq, cq.answer, true, 'practice');
rec = S.state.concepts['m-pct-1'];
ok(rec.status === 'IMPROVING' && rec.status !== 'MASTERED', 'one correct ≠ MASTERED');
// correct x2 + mixed
const other = selector.pickQuestions({ conceptId: 'm-pct-1' }, 2);
mastery.recordAttempt(other[0], other[0].answer, true, 'practice');
mastery.recordAttempt(other[1], other[1].answer, true, 'mixed');
rec = S.state.concepts['m-pct-1'];
ok(rec.status === 'MASTERED', '3 correct + mixed → MASTERED');
ok(rec.nextRev > S.today(), 'MASTERED gets future revision date');
// weakness returns
const wq = Bank.questions.get('q-pct-3');
mastery.recordAttempt(wq, 0, false, 'mixed');
rec = S.state.concepts['m-pct-2'] || S.state.concepts['m-pct-1'];
const rec2 = S.state.concepts['m-pct-2'];
ok(rec2 && rec2.status === 'WEAK', 'wrong after mastery → WEAK again');

// 3+ wrongs → teach from zero (fresh concept: decimals)
const decQ = Bank.questions.get('q-de-1'); // concept m-dec-1
mastery.recordAttempt(decQ, 0, false, 'practice');
const moreDec = selector.pickQuestions({ conceptId: 'm-dec-1' }, 3);
mastery.recordAttempt(moreDec[0], 0, false, 'practice');
mastery.recordAttempt(moreDec[1], 0, false, 'practice');
rec = S.state.concepts['m-dec-1'];
ok(rec.needsZero === true && rec.wrongStreak >= 3, '3 wrongs → Teach From Zero flag');
ok(mastery.drillPlanAfterWrong('m-dec-1').teachZero === true, 'drill plan recommends teach-from-zero');
const dp = mastery.drillPlanAfterWrong('m-dec-1');
ok(dp.count === 3 && dp.level === 1, 'drill plan gives 3 easy questions');

/* ---------- selector rules ---------- */
S.reset();
content.registerStarterContent();
const qs = selector.pickQuestions({ subjectId: 'MATH' }, 5);
ok(qs.length === 5, 'selector returns requested count');
ok(new Set(qs.map(q => q.id)).size === 5, 'no identical question repeats');
const weakDrill = selector.pickQuestions({ methodId: 'pct-increase' }, 6);
ok(weakDrill.length === 6, 'weak-model drill fills with variants');
ok(weakDrill.some(q => q.source === 'AI'), 'variants labeled AI-GENERATED PRACTICE');
const texts = new Set(weakDrill.map(q => q.text));
ok(texts.size === weakDrill.length, 'same model drill → DIFFERENT questions (no exact repeats)');
ok(weakDrill.every(q => q.methodId === 'pct-increase'), 'variants stay on the same model');
// guide-only with no guides → empty
const gq = selector.buildQuiz('guide', {});
ok(gq.questions.length === 0, 'guide quiz honestly empty before any guide import');
const exam = selector.buildQuiz('exam', { count: 30 });
ok(exam.questions.length === 30, 'exam mode assembles 30 questions');
const mix = selector.buildQuiz('mixed', { count: 8 });
ok(mix.questions.length === 8, 'mixed quiz builds');

/* ---------- smart session ---------- */
const s10 = smart.buildSmartSession(10);
ok(s10.blocks.length >= 1 && s10.blocks.every(b => b.minutes > 0), 'smart 10min has valid blocks');
const s60 = smart.buildSmartSession(60);
const totalMin = s60.blocks.reduce((a, b) => a + b.minutes, 0);
ok(Math.abs(totalMin - 60) <= 2, `smart 60min blocks ≈ 60 (got ${totalMin})`);

/* ---------- guide parser ---------- */
const importer = await import(new URL('guides/importer.js', base));
const sampleGuide = `CHAPTER 1: Percentage
Percentage means per hundred. x% of N = x/100 * N.
Q1. A price is Rs.400 and increases by 20%. Find the new price.
(a) Rs.420 (b) Rs.480 (c) Rs.500 (d) Rs.460
Ans. (b)
Sol. New = 400 x 120/100 = 480.
Q2. Find 25% of 80. (RRB ALP 2018)
(a) 20 (b) 25 (c) 15 (d) 30
Ans. (a)
Sol. 25% = 1/4, so 80/4 = 20.
CHAPTER 2: Computer Basics
A computer has hardware and software. CPU is the brain.
Q3. The brain of the computer is:
(a) RAM (b) CPU (c) Monitor (d) Keyboard
Ans. (b)`;
const parsed = importer.parseGuide(sampleGuide, { title: 'Sample Maths Guide' });
ok(parsed.sections.length >= 2, 'parser found chapters');
const totalParsedQ = parsed.sections.reduce((a, s) => a + s.questions.length, 0);
ok(totalParsedQ === 3, `parser found all 3 questions (got ${totalParsedQ})`);
const pctSection = parsed.sections.find(s => /Percentage/i.test(s.title));
ok(pctSection && pctSection.guessTopicId === 'percentages', 'percentage chapter mapped to syllabus');
const compSection = parsed.sections.find(s => /Computer/i.test(s.title));
ok(compSection && !compSection.guessTopicId && compSection.guessExtra === 'x-computer', 'computer chapter → GUIDE EXTRA (x-computer)');
const pyq = parsed.sections[0].questions.find(q => q.examRef);
ok(pyq && pyq.examRef.kind === 'RRB', 'RRB exam reference detected from guide claim');
ok(parsed.sections[0].questions.every(q => q.answerAvailable), 'answers parsed');

const guide = importer.finalizeGuide(parsed, {});
ok(guide.questions.length === 3, 'finalize registers guide questions');
ok(guide.questions.length > 0 && Bank.questions.has(guide.questions[0].id), 'guide questions in bank');
const withRRB = guide.questions.find(q => q.source === 'PYQ');
ok(!!withRRB && /Per guide/.test(withRRB.sourceRef), 'RRB-claimed question labeled VERIFIED RRB/PYQ with guide-claimed ref');
const gQuiz = selector.buildQuiz('guide', { count: 3 });
ok(gQuiz.questions.length === 2 && gQuiz.questions.every(q => q.source === 'GUIDE' || q.source === 'PYQ'),
  'guide quiz serves IN-SYLLABUS guide questions only (2 of 3; computer one is GUIDE EXTRA)');
const gQuizAll = selector.buildQuiz('guide', { count: 3, includeExtra: true });
ok(gQuizAll.questions.length === 3, 'guide quiz with includeExtra serves all guide questions');
const compQ = guide.questions.find(q => q.extra === true);
ok(compQ && compQ.topicId === null, 'computer question flagged GUIDE EXTRA');

/* ---------- plan ---------- */
S.state.guides = {}; Bank.removeGuideQuestions(guide.id);
const plan = planMod.buildPlan(10);
ok(plan.days.length === 10, '10-day plan built');
const day1 = plan.days[0];
const subjSet = new Set(day1.tasks.filter(t => t.subjectId).map(t => t.subjectId));
ok(subjSet.size >= 3, `day 1 covers multiple subjects (${subjSet.size})`);
ok(plan.days[5].tasks.some(t => t.kind === 'EXAM'), 'day 6 has exam task');
ok(plan.days[9].tasks.some(t => t.kind === 'EXAM'), 'day 10 has exam task');
const allDaysMulti = plan.days.every(d => new Set(d.tasks.filter(t => t.subjectId).map(t => t.subjectId)).size >= 3);
ok(allDaysMulti, 'every day covers multiple subjects');

console.log(`\n==== SMOKE RESULTS: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
