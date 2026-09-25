/* ============================================================
   STORE — single source of truth + persistence.
   Storage is behind a tiny adapter (localStorage now, Supabase later).
   NO fake numbers: every progress value is derived from real activity.
   ============================================================ */
import { SUBJECTS, TOPICS, TOPIC_BY_ID } from './syllabus.js';

const KEY = 'rrb-t3-trainer-v1';

const storage = {
  get() {
    try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  },
  set(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (e) { console.warn('save failed', e); return false; }
  },
  clear() { try { localStorage.removeItem(KEY); } catch (e) {} },
};

/* ---------- content registries (filled at boot by content/index.js) ----------
   These are static definitions (concepts, methods, questions, generators)
   plus guide-imported content added at runtime. Guide content is stored in
   state.guides; its questions are merged into the runtime bank.          */
export const Bank = {
  concepts: new Map(),   // id -> concept
  methods: new Map(),    // id -> method
  questions: new Map(),  // id -> question (static + guide + generated)
  generators: new Map(), // id -> generator
  registerConcept(c) { this.concepts.set(c.id, c); },
  registerMethod(m) { this.methods.set(m.id, m); },
  registerQuestion(q) { this.questions.set(q.id, q); },
  registerGenerator(g) { this.generators.set(g.id, g); },
  addGuideQuestions(questions) { for (const q of questions) this.questions.set(q.id, q); },
  removeGuideQuestions(guideId) {
    for (const [id, q] of [...this.questions]) if (q.guideId === guideId) this.questions.delete(id);
  },
  questionsBy(fn) { return [...this.questions.values()].filter(fn); },
};

/* ---------- default state ---------- */
function defaultState() {
  return {
    v: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {
      name: '',
      examDate: null,          // 'YYYY-MM-DD' or null
      examMinutes: 90,
      examQuestions: 100,
      negative: true,          // 1/3 negative marking in exam mode
    },
    concepts: {},   // conceptId -> record
    methods: {},    // methodId  -> record
    qstats: {},     // questionId -> { n, c, lastAt }
    read: {},       // sectionId -> { at }   (guide sections read)
    guides: {},     // guideId -> parsed guide (see guides/importer.js)
    attempts: [],   // capped attempt log
    days: {},       // 'YYYY-MM-DD' -> { q, c, min, concepts, sections }
    plan: null,     // 10-day plan
    resume: null,   // { label, route }
    githubSync: null, // GitHub guide source state (js/guides/github.js)
    onboarded: false,
  };
}

export const S = {
  state: null,

  init() {
    this.state = storage.get();
    if (!this.state || this.state.v !== 1) this.state = defaultState();
    else this.state = { ...defaultState(), ...this.state }; // forward-compatible merge
    return this.state;
  },

  save() {
    this.state.updatedAt = new Date().toISOString();
    return storage.set(this.state); // false when storage is full / unavailable
  },

  reset() { storage.clear(); this.state = defaultState(); this.save(); },

  exportJSON() { return JSON.stringify(this.state, null, 2); },

  importJSON(text) {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || !data.concepts) throw new Error('Not a valid trainer backup file');
    if (data.v !== 1) throw new Error('Unsupported backup version');
    this.state = { ...defaultState(), ...data };
    this.save();
    return true;
  },

  /* ---------- date helpers ---------- */
  today() { return new Date().toISOString().slice(0, 10); },
  addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  },
  dayDiff(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); },

  day() {
    const t = this.today();
    if (!this.state.days[t]) this.state.days[t] = { q: 0, c: 0, min: 0, concepts: 0, sections: 0 };
    return this.state.days[t];
  },

  /* ---------- concepts (weak concept bank) ---------- */
  concept(id) {
    if (!this.state.concepts[id]) {
      this.state.concepts[id] = {
        status: 'NEW', wrong: 0, correct: 0, streak: 0, wrongStreak: 0,
        needsZero: false, mixedCorrect: false, learned: false,
        lastAt: null, nextRev: null, intervalIdx: 0,
      };
    }
    return this.state.concepts[id];
  },
  method(id) {
    if (!this.state.methods[id]) this.state.methods[id] = { attempts: 0, correct: 0, wrongStreak: 0, lastAt: null };
    return this.state.methods[id];
  },

  markConceptLearned(id) {
    const r = this.concept(id);
    if (!r.learned) { r.learned = true; this.day().concepts += 1; }
    this.save();
  },

  /* ---------- guide sections ---------- */
  markSectionRead(sectionId) {
    if (!this.state.read[sectionId]) {
      this.state.read[sectionId] = { at: new Date().toISOString() };
      this.day().sections += 1;
      this.save();
      return true;
    }
    return false;
  },
  isSectionRead(sectionId) { return !!this.state.read[sectionId]; },

  setResume(label, route) { this.state.resume = { label, route, at: Date.now() }; this.save(); },
};

/* ============================================================
   DERIVED PROGRESS — all real, computed from activity
   ============================================================ */

export function contentUnits(topicId) {
  /* A content unit = starter concept (not learned) OR guide section mapped
     to this topic (IN SYLLABUS only). Returns {total, done}. */
  const concepts = [...Bank.concepts.values()].filter(c => c.topicId === topicId);
  let total = concepts.length, done = 0;
  for (const c of concepts) if (S.state.concepts[c.id]?.learned) done++;
  const guides = Object.values(S.state.guides);
  for (const g of guides) {
    for (const sec of g.sections) {
      if (sec.topicId === topicId && sec.inSyllabus) {
        total += 1;
        if (S.isSectionRead(sec.id)) done += 1;
      }
    }
  }
  return { total, done };
}

export function questionUnits(topicId) {
  const qs = Bank.questionsBy(q => q.topicId === topicId && q.answerAvailable);
  const done = qs.filter(q => S.state.qstats[q.id]).length;
  return { total: qs.length, done };
}

export function topicProgress(topicId) {
  const topic = TOPIC_BY_ID[topicId];
  const concepts = [...Bank.concepts.values()].filter(c => c.topicId === topicId);
  let mastered = 0, weak = 0, learning = 0;
  for (const c of concepts) {
    const r = S.state.concepts[c.id];
    if (!r) continue;
    if (r.status === 'MASTERED') mastered++;
    else if (r.status === 'WEAK') weak++;
    else if (r.status === 'LEARNING' || r.status === 'IMPROVING') learning++;
  }
  const content = contentUnits(topicId);
  const questions = questionUnits(topicId);
  const dueRev = concepts.filter(c => {
    const r = S.state.concepts[c.id];
    return r && r.nextRev && r.nextRev <= S.today();
  }).length;
  return { topic, concepts: concepts.length, mastered, weak, learning, content, questions, dueRev };
}

export function subjectProgress(subjectId) {
  const topics = TOPICS.filter(t => t.subjectId === subjectId);
  let cTotal = 0, cDone = 0, qTotal = 0, qDone = 0, conceptsTotal = 0, mastered = 0, weak = 0, learning = 0, dueRev = 0;
  for (const t of topics) {
    const p = topicProgress(t.id);
    cTotal += p.content.total; cDone += p.content.done;
    qTotal += p.questions.total; qDone += p.questions.done;
    conceptsTotal += p.concepts; mastered += p.mastered; weak += p.weak; learning += p.learning; dueRev += p.dueRev;
  }
  const weakList = weakConcepts().filter(c => c.concept.subjectId === subjectId);
  return {
    subject: SUBJECTS.find(s => s.id === subjectId),
    contentPct: cTotal ? Math.round((cDone / cTotal) * 100) : 0,
    questionPct: qTotal ? Math.round((qDone / qTotal) * 100) : 0,
    conceptsTotal, mastered, weak, learning, dueRev,
    weakList,
    hasContent: (cTotal + conceptsTotal) > 0,
    topicsTouched: topics.filter(t => {
      const p = topicProgress(t.id);
      return p.content.done > 0 || p.questions.done > 0 || p.mastered + p.weak + p.learning > 0;
    }).length,
  };
}

export function weakConcepts() {
  const out = [];
  for (const [id, r] of Object.entries(S.state.concepts)) {
    if (r.status === 'WEAK' || r.status === 'IMPROVING') {
      const concept = Bank.concepts.get(id);
      if (concept) out.push({ concept, record: r });
    }
  }
  out.sort((a, b) => (b.record.wrong - a.record.wrong) || (a.record.lastAt < b.record.lastAt ? 1 : -1));
  return out;
}

export function revisionDue(today = S.today()) {
  const out = [];
  for (const [id, r] of Object.entries(S.state.concepts)) {
    if (!r.nextRev) continue;
    const concept = Bank.concepts.get(id);
    if (!concept) continue;
    out.push({ concept, record: r, dueOn: r.nextRev, overdue: r.nextRev <= today });
  }
  out.sort((a, b) => a.dueOn < b.dueOn ? -1 : 1);
  return out;
}

export function overallProgress() {
  const per = SUBJECTS.map(s => subjectProgress(s.id));
  const hasAnyContent = per.some(p => p.hasContent);
  let cT = 0, cD = 0, qT = 0, qD = 0;
  for (const p of per) { cT += p.contentPct ? 1 : 0; }
  const avgContent = per.filter(p => p.hasContent);
  return {
    per,
    hasAnyContent,
    contentPct: avgContent.length ? Math.round(avgContent.reduce((a, p) => a + p.contentPct, 0) / avgContent.length) : 0,
    weakTotal: per.reduce((a, p) => a + p.weak, 0),
    dueTotal: revisionDue().filter(x => x.overdue).length,
  };
}

/* guide progress: IN SYLLABUS sections vs GUIDE EXTRA, per guide */
export function guideProgress(guideId) {
  const g = S.state.guides[guideId];
  if (!g) return null;
  let inTotal = 0, inDone = 0, exTotal = 0, exDone = 0, qTotal = 0, qDone = 0, qNoAns = 0;
  for (const sec of g.sections) {
    const read = S.isSectionRead(sec.id);
    if (sec.inSyllabus) { inTotal++; if (read) inDone++; } else { exTotal++; if (read) exDone++; }
  }
  if (g.stub) {
    /* large guide kept on disk: counts come from the light stub + real qstats */
    qTotal = g.qTotal || 0;
    qNoAns = g.qNoAns || 0;
    const prefix = `g:${guideId}:`;
    for (const id of Object.keys(S.state.qstats)) if (id.startsWith(prefix)) qDone++;
  } else {
    for (const q of g.questions) {
      if (q.answerAvailable) { qTotal++; if (S.state.qstats[q.id]) qDone++; } else qNoAns++;
    }
  }
  return { inTotal, inDone, exTotal, exDone, qTotal, qDone, qNoAns };
}

/* Usable (answered) guide questions — works for full guides AND disk-backed
   stub guides whose questions live in the runtime Bank. */
export function guideUsableQuestions(guideId) {
  return Bank.questionsBy(q => q.guideId === guideId && q.answerAvailable).length;
}
