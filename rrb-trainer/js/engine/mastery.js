/* ============================================================
   MASTERY ENGINE — weak-concept bank, status transitions,
   spaced revision scheduling.

   Statuses: NEW → LEARNING → WEAK/IMPROVING → MASTERED
   Rules (from spec):
   - One correct answer NEVER makes a concept MASTERED.
   - Wrong 1 → explain + 1 similar-but-different question
   - Wrong 2 → explain specific mistake + 2 different same-model questions
   - Wrong 3+ → activate Teach From Zero, easy questions, gradual difficulty
   - Correct streak + a mixed/exam-style correct → MASTERED
   - Weakness returns → back to WEAK, rescheduled for revision
   ============================================================ */
import { S, Bank } from '../store.js';

export const STATUS_INFO = {
  NEW:       { label: 'NEW',       cls: 'gray'  },
  LEARNING:  { label: 'LEARNING',  cls: 'blue'  },
  WEAK:      { label: 'WEAK',      cls: 'red'   },
  IMPROVING: { label: 'IMPROVING', cls: 'amber' },
  MASTERED:  { label: 'MASTERED',  cls: 'green' },
};

/* Spaced revision intervals in days (spec example: 1,2,4,7,10 then longer) */
export const INTERVALS = [1, 2, 4, 7, 10, 15, 25];

export function scheduleRevision(rec, success) {
  const today = S.today();
  if (success) {
    rec.intervalIdx = Math.min(rec.intervalIdx + 1, INTERVALS.length - 1);
    rec.nextRev = S.addDays(today, INTERVALS[rec.intervalIdx]);
  } else {
    rec.intervalIdx = 0;
    rec.nextRev = S.addDays(today, 1);
  }
}

/* Called after every answered question. question must have
   conceptId?/methodId? Returns events for UI ("promote teach-from-zero" etc). */
export function recordAttempt(question, chosenIdx, correct, mode, timeMs = 0) {
  const now = new Date().toISOString();
  const events = [];

  // question stats + attempt log (never re-ask recently attempted in practice)
  const qs = S.state.qstats[question.id] || (S.state.qstats[question.id] = { n: 0, c: 0, lastAt: null });
  qs.n += 1; if (correct) qs.c += 1; qs.lastAt = now;

  S.state.attempts.push({ q: question.id, s: question.subjectId, t: question.topicId,
    c: correct ? 1 : 0, k: chosenIdx, m: mode, at: now, ms: Math.round(timeMs) });
  if (S.state.attempts.length > 4000) S.state.attempts = S.state.attempts.slice(-3000);

  const day = S.day();
  day.q += 1; if (correct) day.c += 1;
  if (timeMs > 0) day.min += Math.max(Math.round(timeMs / 60000), 0);

  // method-level stats (Maths models etc.)
  if (question.methodId && Bank.methods.has(question.methodId)) {
    const m = S.method(question.methodId);
    m.attempts += 1; if (correct) m.correct += 1; m.lastAt = now;
    if (correct) m.wrongStreak = 0; else m.wrongStreak += 1;
  }

  // concept-level weak bank
  if (question.conceptId && Bank.concepts.has(question.conceptId)) {
    const rec = S.concept(question.conceptId);
    const prev = rec.status;
    rec.lastAt = now;
    if (correct) {
      rec.correct += 1; rec.streak += 1; rec.wrongStreak = 0;
      if (mode === 'mixed' || mode === 'exam' || mode === 'revision' || mode === 'smart') rec.mixedCorrect = true;
      if (rec.status === 'WEAK' || rec.status === 'NEW') rec.status = rec.wrong > 0 ? 'IMPROVING' : 'LEARNING';
      else if (rec.status === 'LEARNING') rec.status = 'IMPROVING';
      if (rec.needsZero && rec.streak >= 3) rec.needsZero = false;
      if (rec.streak >= 3 && rec.mixedCorrect && rec.status === 'IMPROVING') {
        rec.status = 'MASTERED';
        scheduleRevision(rec, true);
        events.push({ type: 'mastered', conceptId: question.conceptId });
      } else if (rec.status === 'IMPROVING' || rec.status === 'LEARNING') {
        // keep seeing it soon while improving, but not instantly
        rec.nextRev = S.addDays(S.today(), 1);
      }
    } else {
      rec.wrong += 1; rec.streak = 0; rec.wrongStreak += 1;
      if (rec.status === 'MASTERED' || rec.status === 'IMPROVING') {
        rec.status = 'WEAK';
        events.push({ type: 'weakness-returned', conceptId: question.conceptId });
      } else if (rec.status !== 'WEAK') rec.status = 'WEAK';
      if (rec.wrongStreak >= 3 && !rec.needsZero) {
        rec.needsZero = true;
        events.push({ type: 'teach-from-zero', conceptId: question.conceptId });
      }
      scheduleRevision(rec, false);
      events.push({ type: 'weak', conceptId: question.conceptId, wrongStreak: rec.wrongStreak });
    }
    if (prev !== rec.status) events.push({ type: 'status', conceptId: question.conceptId, from: prev, to: rec.status });
  }

  S.save();
  return events;
}

/* What should happen after a wrong answer (spec §9):
   wrongStreak 1 → 1 similar-different question
   wrongStreak 2 → 2 different same-model questions
   wrongStreak 3+ → teach-from-zero + easy same-model questions          */
export function drillPlanAfterWrong(conceptId) {
  const rec = S.state.concepts[conceptId];
  if (!rec) return { count: 0, level: null };
  if (rec.wrongStreak >= 3) return { count: 3, level: 1, teachZero: true };
  if (rec.wrongStreak === 2) return { count: 2, level: 1 };
  if (rec.wrongStreak === 1) return { count: 1, level: 1 };
  return { count: 0, level: null };
}
