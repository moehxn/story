/* ============================================================
   10-DAY STUDY PLAN — adaptive, covers ALL four subjects every day.
   Priorities (spec §19): unfinished syllabus → important guide material
   → weak concepts → revision due → different question models → exam practice.
   Tasks auto-complete from REAL activity; manual toggle also allowed.
   ============================================================ */
import { S, Bank, subjectProgress, weakConcepts, revisionDue } from '../store.js';
import { SUBJECTS, TOPICS } from '../syllabus.js';

let taskSeq = 1;

function priorityScore(subjectId) {
  const p = subjectProgress(subjectId);
  const marksW = { MATH: 25, REASONING: 25, SCIENCE: 40, GA: 10 }[subjectId] / 40;
  const unfinished = p.hasContent ? (1 - p.contentPct / 100) : 1;
  return marksW * 0.6 + unfinished * 0.3 + Math.min(p.weak, 6) * 0.05 + Math.min(p.dueRev, 5) * 0.02;
}

function unlearnedConcepts(subjectId, limit = 2, exclude = new Set()) {
  const list = [];
  for (const t of TOPICS.filter(t => t.subjectId === subjectId)) {
    for (const c of Bank.concepts.values()) {
      if (c.topicId === t.id && !exclude.has(c.id)) {
        const r = S.state.concepts[c.id];
        if (!r || !r.learned) list.push(c);
      }
    }
  }
  return list.slice(0, limit);
}

function unreadGuideSections(subjectId, limit = 2) {
  const out = [];
  for (const g of Object.values(S.state.guides)) {
    for (const sec of g.sections) {
      if (!sec.include) continue;
      if (sec.topicId && TOPICS.find(t => t.id === sec.topicId)?.subjectId === subjectId && !S.isSectionRead(sec.id)) {
        out.push({ sec, guide: g });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

function attemptsOn(dateStr, filterFn = () => true) {
  return S.state.attempts.filter(a => a.at.slice(0, 10) === dateStr && filterFn(a)).length;
}

export function buildPlan(days = 10) {
  const plan = { start: S.today(), builtAt: new Date().toISOString(), days: [] };
  const usedConcepts = new Set();

  for (let d = 0; d < days; d++) {
    const date = S.addDays(plan.start, d);
    const dayNum = d + 1;
    const tasks = [];

    /* revision due (specific concepts) */
    const due = revisionDue(date).filter(x => x.overdue);
    if (due.length) {
      tasks.push({ id: 't' + taskSeq++, kind: 'REVISE', subjectId: null, label: `Revise ${Math.min(due.length, 6)} due concept${due.length > 1 ? 's' : ''}`,
        conceptIds: due.slice(0, 6).map(x => x.concept.id), qty: due.length, done: false, doneAt: null });
    }

    /* weak concepts (dynamic — drills whatever is weak on that day) */
    const weak = weakConcepts();
    if (weak.length) {
      tasks.push({ id: 't' + taskSeq++, kind: 'WEAK', subjectId: null, label: `Drill ${Math.min(weak.length, 4)} weak concept${weak.length > 1 ? 's' : ''} (same model, new questions)`,
        conceptIds: weak.slice(0, 4).map(x => x.concept.id), qty: Math.min(weak.length, 4), done: false, doneAt: null });
    }

    /* one task per subject — every subject, every day (unless nothing left) */
    const order = [...SUBJECTS].sort((a, b) => priorityScore(b.id) - priorityScore(a.id));
    const isExamDay = dayNum === 6 || dayNum === days;
    let subjectTaskCount = 0;
    for (const s of order) {
      const p = subjectProgress(s.id);
      const learn = unlearnedConcepts(s.id, 2, usedConcepts);
      const guideSecs = unreadGuideSections(s.id, 2);
      let task = null;
      const rank = subjectTaskCount; // 0 = highest priority subject today
      if (learn.length && (rank < 2 || !guideSecs.length)) {
        learn.forEach(c => usedConcepts.add(c.id));
        task = { id: 't' + taskSeq++, kind: 'LEARN', subjectId: s.id, topicId: learn[0].topicId,
          label: `Learn: ${learn.map(c => c.title).join(' + ')}`,
          conceptIds: learn.map(c => c.id), qty: learn.length, done: false, doneAt: null };
      } else if (guideSecs.length) {
        task = { id: 't' + taskSeq++, kind: 'GUIDE', subjectId: s.id, topicId: guideSecs[0].sec.topicId,
          label: `Guide: ${guideSecs[0].guide.title} — ${guideSecs[0].sec.title}`,
          guideId: guideSecs[0].guide.id, sectionIds: guideSecs.map(x => x.sec.id), qty: guideSecs.length, done: false, doneAt: null };
      } else if (p.hasContent || Bank.questionsBy(q => q.subjectId === s.id).length) {
        const n = isExamDay ? 5 : 8;
        task = { id: 't' + taskSeq++, kind: 'PRACTICE', subjectId: s.id,
          label: `Practice ${n} questions — ${s.short} (mixed models)`, qty: n, done: false, doneAt: null };
      }
      if (task) { tasks.push(task); subjectTaskCount++; }
    }

    /* exam-style practice on day 6 (short mock) and final day (full) */
    if (dayNum === 6) {
      tasks.push({ id: 't' + taskSeq++, kind: 'EXAM', subjectId: null, label: 'Half mock exam (50 questions, timed)',
        qty: 50, done: false, doneAt: null, halfMock: true });
    }
    if (dayNum === days) {
      tasks.push({ id: 't' + taskSeq++, kind: 'EXAM', subjectId: null, label: 'Full mock exam (100 questions, timed)',
        qty: 100, done: false, doneAt: null, halfMock: false });
    }

    plan.days.push({ date, dayNum, tasks });
  }
  S.state.plan = plan;
  S.save();
  return plan;
}

/* Re-plan only days that haven't finished yet (keeps history). */
export function rebuildRemaining() {
  const old = S.state.plan;
  if (!old) return buildPlan();
  const today = S.today();
  const keepIdx = old.days.findIndex(d => d.date >= today);
  const remaining = keepIdx === -1 ? 0 : old.days.length - keepIdx;
  if (remaining <= 0) return buildPlan();
  const fresh = buildPlan(remaining);
  const merged = old.days.slice(0, keepIdx).concat(fresh.days);
  S.state.plan = { ...fresh, days: merged };
  S.save();
  return S.state.plan;
}

/* Task auto-completion — derived from real activity, then persisted. */
export function evaluateTask(task, dateStr) {
  if (task.done) return true;
  let ok = false;
  switch (task.kind) {
    case 'LEARN':
      ok = (task.conceptIds || []).every(id => S.state.concepts[id]?.learned);
      break;
    case 'GUIDE':
      ok = (task.sectionIds || []).every(id => S.isSectionRead(id));
      break;
    case 'PRACTICE':
      ok = attemptsOn(dateStr, a => a.s === task.subjectId) >= task.qty;
      break;
    case 'WEAK':
      ok = attemptsOn(dateStr, a => a.c === 1 && a.t && (task.conceptIds || []).some(cid => {
        const c = Bank.concepts.get(cid); return c && c.topicId === a.t;
      })) >= Math.min(task.qty, 2);
      break;
    case 'REVISE':
      ok = attemptsOn(dateStr, a => (task.conceptIds || []).includes(a.cid || '')) >= 1;
      break;
    case 'EXAM':
      ok = attemptsOn(dateStr, a => a.m === 'exam') >= Math.min(task.qty, 10);
      break;
    case 'MIXED':
      ok = attemptsOn(dateStr) >= task.qty;
      break;
  }
  if (ok) { task.done = true; task.doneAt = new Date().toISOString(); S.save(); }
  return ok;
}

export function currentPlanDay() {
  const plan = S.state.plan;
  if (!plan) return null;
  const today = S.today();
  return plan.days.find(d => d.date === today) ||
         plan.days.find(d => d.date > today) ||
         plan.days[plan.days.length - 1];
}

export function planDayProgress(day) {
  if (!day || !day.tasks.length) return { done: 0, total: 0 };
  for (const t of day.tasks) evaluateTask(t, day.date);
  return { done: day.tasks.filter(t => t.done).length, total: day.tasks.length };
}
