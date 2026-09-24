/* ============================================================
   QUESTION SELECTOR — adaptive, guide-first.

   Priority (spec §17): 1 GUIDE  2 VERIFIED RRB/PYQ  3 OFFICIAL/VERIFIED
                        4 EXPECTED PRACTICE  5 AI-GENERATED PRACTICE
   Rules:
   - Never repeat an EXACT question in practice unless intentionally
     recalling it (revision) — recent attempts are excluded first, and
     least-recently-used ones are preferred when the pool runs low.
   - Weak Maths model → SAME model, DIFFERENT question (fresh variants).
   - Generated variants are always labeled AI-GENERATED PRACTICE.
   ============================================================ */
import { S, Bank } from '../store.js';
import { SUBJECTS, TOPICS } from '../syllabus.js';

const SRC_RANK = { GUIDE: 0, PYQ: 1, OFFICIAL: 2, EXPECTED: 3, AI: 4 };
const DAY_MS = 86400000;
let genCounter = 0;

const recentDays = (qid, days = 7) => {
  const st = S.state.qstats[qid];
  if (!st || !st.lastAt) return Infinity;
  return (Date.now() - new Date(st.lastAt).getTime()) / DAY_MS;
};

/* Comparison: guide-first priority, then never-used, then least-recently-used. */
function cmpQuestions(a, b) {
  const r = SRC_RANK[a.source] - SRC_RANK[b.source];
  if (r !== 0) return r;
  const na = S.state.qstats[a.id]?.n || 0;
  const nb = S.state.qstats[b.id]?.n || 0;
  if (na !== nb) return na - nb;
  const ta = S.state.qstats[a.id]?.lastAt ? new Date(S.state.qstats[a.id].lastAt).getTime() : 0;
  const tb = S.state.qstats[b.id]?.lastAt ? new Date(S.state.qstats[b.id].lastAt).getTime() : 0;
  return ta - tb;
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function pool(spec) {
  return Bank.questionsBy(q => {
    if (!q.answerAvailable) return false;
    if (spec.subjectId && q.subjectId !== spec.subjectId) return false;
    if (spec.topicId && q.topicId !== spec.topicId) return false;
    if (spec.conceptId && q.conceptId !== spec.conceptId) return false;
    if (spec.methodId && q.methodId !== spec.methodId) return false;
    if (spec.guideOnly && q.source !== 'GUIDE' && q.source !== 'PYQ') return false;
    if (spec.guideId && q.guideId !== spec.guideId) return false;
    if (spec.excludeIds && spec.excludeIds.includes(q.id)) return false;
    if (spec.sources && !spec.sources.includes(q.source)) return false;
    if (spec.maxDifficulty && q.difficulty > spec.maxDifficulty) return false;
    if (spec.minDifficulty && q.difficulty < spec.minDifficulty) return false;
    if (spec.inSyllabusOnly && q.extra === true) return false;
    return true;
  });
}

/* Fresh variant from a generator — DIFFERENT numbers/context each time. */
export function generateVariant(generatorId, opts = {}) {
  const g = Bank.generators.get(generatorId);
  if (!g) return null;
  const avoid = new Set(opts.avoidTexts || []);
  let made = null;
  for (let tryN = 0; tryN < 12; tryN++) {
    const v = g.make();
    if (!v || avoid.has(v.text)) continue;
    let clash = false;
    for (const [id, q] of Bank.questions) {
      if (q.text === v.text && S.state.qstats[id] && recentDays(id, 30) < 30) { clash = true; break; }
    }
    if (!clash) { made = v; break; }
    avoid.add(v.text);
  }
  if (!made) made = g.make(); // extremely unlikely; accept a far-future repeat
  const id = `gen-${generatorId}-${++genCounter}-${Date.now().toString(36)}`;
  const q = {
    id, subjectId: g.subjectId, topicId: g.topicId,
    conceptId: opts.conceptId || g.conceptId || null,
    methodId: g.methodId || null,
    subtopicId: g.subtopicId || null,
    qtype: opts.qtype || 'practice',
    difficulty: opts.difficulty || g.difficulty || 2,
    source: 'AI', sourceRef: `Fresh variant of “${g.label}” model — generated now, not from any guide or exam`,
    text: made.text, options: made.options, answer: made.answer,
    tests: made.tests || g.label ? (made.tests || `Applying the ${g.label} method`) : undefined,
    solution: made.solution, wrongWhy: made.wrongWhy || null,
    trap: made.trap || g.trap || null,
    memory: made.memory || g.memory || null,
    recall: made.recall || g.recall || null,
    generatorId, signature: made.signature || made.text,
    answerAvailable: true,
  };
  Bank.registerQuestion(q);
  return q;
}

/* Generators usable for a target (concept or method level). */
function generatorsFor({ conceptId, methodId, topicId }) {
  const out = [];
  for (const g of Bank.generators.values()) {
    if (conceptId && g.conceptId !== conceptId) continue;
    if (methodId && g.methodId !== methodId) continue;
    if (!conceptId && !methodId && topicId && g.topicId !== topicId) continue;
    out.push(g);
  }
  return out;
}

/* Core picker. Returns up to `count` questions.
   weakDrill: same concept/method, DIFFERENT questions, easy difficulty ramp. */
export function pickQuestions(spec, count, opts = {}) {
  const out = [];
  const excludeIds = new Set(spec.excludeIds || []);
  const avoidTexts = new Set((spec.avoidTexts || []));

  // 1) bank questions matching spec, guide-first, freshness-aware
  let candidates = pool({ ...spec, excludeIds: [...excludeIds] });
  if (opts.recentFirst !== true) candidates = candidates.filter(q => recentDays(q.id) >= 7);
  // Only fall back to re-serving recently-used bank questions when we have NO
  // generators for this target (or it's a guide-only quiz) — otherwise step 2
  // gives fresh generated variants instead of repeating questions.
  if (candidates.length < count && (spec.guideOnly || generatorsFor(spec).length === 0)) {
    candidates = candidates.concat(pool({ ...spec, excludeIds: [...excludeIds] }).filter(q => !candidates.includes(q)));
  }
  if (spec.maxDifficulty && candidates.length >= count) {
    const easy = candidates.filter(q => q.difficulty <= spec.maxDifficulty);
    if (easy.length >= count) candidates = easy;
  }
  candidates.sort(cmpQuestions);
  // topic/method variety: interleave
  const seenTopic = new Map();
  const varied = [];
  const rest = [...candidates];
  while (rest.length && varied.length < candidates.length) {
    let idx = rest.findIndex(q => (seenTopic.get(q.topicId) || 0) === 0);
    if (idx === -1) idx = 0;
    const q = rest.splice(idx, 1)[0];
    varied.push(q);
    seenTopic.set(q.topicId, (seenTopic.get(q.topicId) || 0) + 1);
  }
  for (const q of varied) { if (out.length >= count) break; out.push(q); excludeIds.add(q.id); avoidTexts.add(q.text); }

  // 2) fill with fresh generated variants (only when generators exist for the target)
  if (out.length < count && !spec.guideOnly) {
    const gens = shuffle(generatorsFor(spec));
    let guard = 0;
    while (out.length < count && gens.length && guard++ < count * 4) {
      const g = gens[(out.length + guard) % gens.length];
      const q = generateVariant(g.id, { avoidTexts: [...avoidTexts], conceptId: spec.conceptId, difficulty: spec.difficulty });
      if (q) { out.push(q); excludeIds.add(q.id); avoidTexts.add(q.text); }
    }
  }
  return out;
}

/* One DIFFERENT mini question on the same concept/method (after a wrong answer). */
export function pickMiniQuestion(refQ) {
  const spec = {
    conceptId: refQ.conceptId || undefined,
    methodId: refQ.methodId || undefined,
    topicId: (!refQ.conceptId && !refQ.methodId) ? refQ.topicId : undefined,
    excludeIds: [refQ.id], avoidTexts: [refQ.text],
    maxDifficulty: Math.max(1, refQ.difficulty - 1),
  };
  const qs = pickQuestions(spec, 1);
  return qs[0] || null;
}

/* ---------------- quiz mode builders ---------------- */

export function buildQuiz(mode, opts = {}) {
  switch (mode) {
    case 'practice': {
      const qs = pickQuestions({
        conceptId: opts.conceptId, methodId: opts.methodId,
        topicId: opts.topicId, subjectId: opts.subjectId,
        maxDifficulty: opts.maxDifficulty, difficulty: opts.difficulty,
      }, opts.count || 3);
      return { mode, questions: qs, title: opts.name || 'Practice' };
    }
    case 'guide': {
      const qs = pickQuestions({ guideOnly: true, guideId: opts.guideId, subjectId: opts.subjectId, topicId: opts.topicId, inSyllabusOnly: !opts.includeExtra },
        opts.count || 10);
      return { mode, questions: qs, title: 'Guide Quiz', guideOnly: true };
    }
    case 'weak': {
      const weak = opts.weakList;
      const questions = [];
      const excludeIds = [];
      for (const w of weak.slice(0, opts.count || 10)) {
        const level = w.record.wrongStreak >= 3 ? 1 : undefined;
        const qs = pickQuestions({ conceptId: w.concept.id, excludeIds, maxDifficulty: level || undefined, difficulty: 1 }, 1);
        if (qs.length) { questions.push(qs[0]); excludeIds.push(qs[0].id); }
        else {
          const ms = pickQuestions({ methodId: w.concept.methodIdFallback || undefined, topicId: w.concept.topicId, excludeIds }, 1);
          if (ms.length) { questions.push(ms[0]); excludeIds.push(ms[0].id); }
        }
      }
      return { mode, questions, title: 'Weak Concept Quiz' };
    }
    case 'subject': {
      const qs = pickQuestions({ subjectId: opts.subjectId }, opts.count || 10);
      return { mode, questions: qs, title: `${opts.name || 'Subject'} Quiz` };
    }
    case 'mixed': {
      // proportional to indicative marks (Math 25, Reasoning 25, Science 40, GA 10)
      const n = opts.count || 10;
      const weights = { MATH: 25, REASONING: 25, SCIENCE: 40, GA: 10 };
      const qs = [];
      const excludeIds = [];
      const order = shuffle(SUBJECTS.map(s => s.id)).sort((a, b) => weights[b] - weights[a]);
      let remaining = n;
      for (let pass = 0; pass < 4 && qs.length < n; pass++) {
        for (const sid of order) {
          if (qs.length >= n) break;
          const share = pass === 0 ? Math.max(1, Math.round(n * weights[sid] / 100)) : 1;
          const got = pickQuestions({ subjectId: sid, excludeIds }, share);
          for (const q of got) { qs.push(q); excludeIds.push(q.id); remaining--; }
        }
      }
      return { mode, questions: qs, title: 'Mixed Quiz' };
    }
    case 'revision': {
      const due = opts.dueList || [];
      const questions = [];
      const excludeIds = [];
      for (const d of due.slice(0, opts.count || 10)) {
        const got = pickQuestions({ conceptId: d.concept.id, excludeIds }, 1);
        if (got.length) { questions.push(got[0]); excludeIds.push(got[0].id); }
      }
      return { mode, questions, title: 'Revision Quiz' };
    }
    case 'exam': {
      const n = opts.count || 100;
      const target = { MATH: 25, REASONING: 25, SCIENCE: 40, GA: 10 };
      const totalW = 100;
      const qs = []; const excludeIds = [];
      const gotCount = {};
      for (const s of SUBJECTS) {
        const want = Math.min(Math.round(n * target[s.id] / totalW), n - qs.length);
        const got = pickQuestions({ subjectId: s.id, excludeIds }, want);
        for (const q of got) { qs.push(q); excludeIds.push(q.id); }
        gotCount[s.id] = got.length;
      }
      // redistribute if a subject lacks questions
      let shortfall = n - qs.length;
      if (shortfall > 0) {
        for (const s of SUBJECTS) {
          if (shortfall <= 0) break;
          const got = pickQuestions({ subjectId: s.id, excludeIds }, shortfall);
          for (const q of got) { qs.push(q); excludeIds.push(q.id); shortfall--; }
          gotCount[s.id] += got.length;
        }
      }
      shuffle(qs);
      return { mode, questions: qs, title: 'Exam Mode', gotCount, requested: n };
    }
    case 'model-mixed': {
      // Method Trainer finale: mixed models of one topic WITHOUT labels
      const qs = pickQuestions({ topicId: opts.topicId, subjectId: opts.subjectId }, opts.count || 6);
      return { mode, questions: qs, title: opts.title || 'Model Recognition Practice' };
    }
    default:
      return { mode, questions: [], title: 'Quiz' };
  }
}

/* All questions currently available per subject (for honest counts). */
export function bankCounts() {
  const out = {};
  for (const s of SUBJECTS) out[s.id] = Bank.questionsBy(q => q.subjectId === s.id && q.answerAvailable).length;
  out.total = Object.values(out).reduce((a, b) => a + b, 0);
  return out;
}
