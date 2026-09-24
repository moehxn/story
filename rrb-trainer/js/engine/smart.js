/* ============================================================
   SMART STUDY SESSIONS (10 / 20 / 30 / 60 minutes)
   Allocation adapts to real state:
   - weak concepts exist → teaching block
   - revision due → revision block
   - unread guide/starter content → reading block
   - rest → practice (question count ≈ 1.2/min)
   Everything unused shifts into practice or guide. No fake filler.
   ============================================================ */
import { S, Bank, weakConcepts, revisionDue } from '../store.js';

export function buildSmartSession(minutes) {
  const blocks = [];
  const today = S.today();
  const weak = weakConcepts().filter(w => w.record.status === 'WEAK' || w.record.needsZero);
  const due = revisionDue().filter(x => x.overdue);

  const guideSections = [];
  for (const g of Object.values(S.state.guides)) {
    for (const sec of g.sections) {
      if (sec.include && sec.inSyllabus && !S.isSectionRead(sec.id)) guideSections.push({ sec, guide: g });
    }
  }
  const unlearnedConcepts = [];
  for (const c of Bank.concepts.values()) {
    const r = S.state.concepts[c.id];
    if (!r || !r.learned) unlearnedConcepts.push(c);
    if (unlearnedConcepts.length > 40) break;
  }

  let t = minutes;

  // 1) weak-concept teaching
  if (weak.length && t >= 10) {
    const m = Math.max(4, Math.min(10, Math.round(minutes * 0.25)));
    blocks.push({ kind: 'teach', minutes: m, label: 'Weak concept teaching',
      conceptIds: weak.slice(0, Math.max(1, Math.round(m / 4))).map(w => w.concept.id) });
    t -= m;
  }
  // 2) revision due
  if (due.length && t >= 8) {
    const m = Math.max(3, Math.min(8, Math.round(minutes * 0.2)));
    blocks.push({ kind: 'revise', minutes: m, label: 'Revision (due today)',
      conceptIds: due.slice(0, Math.max(1, Math.round(m / 3))).map(x => x.concept.id) });
    t -= m;
  }
  // 3) guide / new content reading
  let readPool = guideSections.length ? guideSections.map(x => ({ type: 'guide', id: x.sec.id, guide: x.guide, sec: x.sec }))
                                       : unlearnedConcepts.map(c => ({ type: 'concept', id: c.id }));
  if (readPool.length && t >= 8) {
    const m = Math.max(4, Math.round(t * (guideSections.length ? 0.45 : 0.5)));
    blocks.push({ kind: 'read', minutes: m, label: guideSections.length ? 'Guide material' : 'New concepts',
      items: readPool.slice(0, Math.max(1, Math.round(m / 4))) });
    t -= m;
  }
  // 4) practice with whatever remains
  if (t >= 3) {
    const n = Math.max(3, Math.round(t * 1.2));
    blocks.push({ kind: 'practice', minutes: t, label: 'Practice', count: n });
  }

  return { minutes, blocks, createdAt: Date.now() };
}
