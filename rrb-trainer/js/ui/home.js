/* ============================================================
   HOME DASHBOARD (spec §21) — every number is real, derived from
   actual activity. Empty states are honest, never fake.
   ============================================================ */
import { S, Bank, subjectProgress, overallProgress, weakConcepts, revisionDue } from '../store.js';
import { SUBJECTS, EXAM } from '../syllabus.js';
import { currentPlanDay, planDayProgress } from '../engine/plan.js';
import { $, $$, esc, setView, setTopbarActions, nav, bar, prow, pct, emptyState, toast, fmtDate } from './core.js';

export function homePage() {
  const ov = overallProgress();
  const weak = weakConcepts();
  const due = revisionDue().filter(x => x.overdue);
  const resume = S.state.resume;
  const day = currentPlanDay();
  const dayProg = day ? planDayProgress(day) : null;
  const nextTask = day?.tasks.find(t => !t.done);
  const hasGuides = Object.keys(S.state.guides).length > 0;
  const examDate = S.state.settings.examDate;
  const daysLeft = examDate ? Math.max(0, S.dayDiff(S.today(), examDate)) : null;

  setTopbarActions('');
  setView(`
    <div class="pagehead">
      <h1>${greeting()}${S.state.settings.name ? ', ' + esc(S.state.settings.name) : ''} 👋</h1>
      <p>${ov.hasAnyContent
        ? `Overall guide-content progress across subjects: <b>${ov.contentPct}%</b>${daysLeft !== null ? ` · <b>${daysLeft}</b> day${daysLeft === 1 ? '' : 's'} to exam` : ''}`
        : 'Let’s start from zero — pick a subject or run a 10-minute smart study.'}</p>
    </div>

    ${!ov.hasAnyContent && !hasGuides ? `
    <div class="infobanner">🎯 This trainer follows: official syllabus → your uploaded guides → concepts → practice → revision → mastery.
    The Starter Pack (clearly labeled EXPECTED PRACTICE) works right now — and imported guides always take priority for questions.</div>` : ''}

    ${resume ? `
    <button class="item" data-act="resume">
      <div class="ic" style="background:#1d4ed8">▶️</div>
      <div class="ibody"><b>Continue where I stopped</b><small>${esc(resume.label)}</small></div>
      <div class="iend">resume →</div>
    </button>` : ''}

    ${day ? `
    <div class="card">
      <div class="row between"><h3 style="margin:0">Today’s plan — Day ${day.dayNum}</h3>
        <span class="chip slate">${fmtDate(day.date)}</span></div>
      <div style="margin:8px 0">${bar(pct(dayProg.done, dayProg.total))}</div>
      ${nextTask ? `<p class="small mb0"><b>Next:</b> ${esc(nextTask.label)}</p>` : '<p class="small mb0">✅ All tasks done today. Great work!</p>'}
      <div class="row" style="margin-top:10px">
        <button class="btn small primary" data-act="plan">Open 10-day plan</button>
        ${nextTask ? `<button class="btn small" data-act="nexttask">Do next task</button>` : ''}
      </div>
    </div>` : `
    <div class="card"><h3>10-day study plan</h3>
      <p class="small">A plan covering ALL four subjects, built from your real progress and weak points.</p>
      <button class="btn primary" data-act="plan">Create my plan</button></div>`}

    <div class="section-label">Smart study</div>
    <div class="grid4">
      ${[10, 20, 30, 60].map(m => `
        <button class="btn" data-smart="${m}" style="flex-direction:column;padding:12px 4px">
          <b>${m}</b><small style="font-weight:600">MIN</small></button>`).join('')}
    </div>

    <div class="section-label">Subject progress <span class="small">(real activity only)</span></div>
    ${SUBJECTS.map(s => {
      const p = subjectProgress(s.id);
      return `<button class="item" data-act="subject:${s.id}">
        <div class="ic subbg-${s.id}">${esc(s.icon)}</div>
        <div class="ibody">
          <b>${esc(s.short)}</b>
          <div style="margin-top:5px">${bar(p.contentPct)}</div>
          <small>Guide: ${p.contentPct}% · Concepts: ${pct(p.mastered, p.conceptsTotal)}% · Weak: ${p.weak} · Revision due: ${p.dueRev}</small>
        </div>
        <div class="iend">→</div>
      </button>`;
    }).join('')}

    ${weak.length ? `
    <div class="section-label">Weak concepts</div>
    <div class="card tight">
      ${weak.slice(0, 3).map(w => `<div class="row between" style="padding:5px 0">
        <span style="font-size:13.5px;font-weight:600">${esc(w.concept.title)}</span>
        <span class="chip ${w.record.status === 'WEAK' ? 'red' : 'amber'}">${w.record.status} · ${w.record.wrong}✗</span></div>`).join('')}
      ${weak.length > 3 ? `<p class="small mb0">…and ${weak.length - 3} more</p>` : ''}
      <div class="row" style="margin-top:10px">
        <button class="btn small warn" data-act="drillweak">Practice weak concepts</button>
        <button class="btn small ghost" data-act="teachzero">Teach from zero</button>
      </div>
    </div>` : ''}

    ${due.length ? `
    <div class="section-label">Revision due</div>
    <div class="card tight">
      ${due.slice(0, 3).map(d => `<div class="row between" style="padding:5px 0">
        <span style="font-size:13.5px;font-weight:600">${esc(d.concept.title)}</span>
        <span class="chip red">due ${fmtDate(d.dueOn)}</span></div>`).join('')}
      ${due.length > 3 ? `<p class="small mb0">…and ${due.length - 3} more</p>` : ''}
      <button class="btn small primary" data-act="revise" style="margin-top:10px">Start revision quiz</button>
    </div>` : ''}

    <div class="section-label">Guide progress</div>
    ${hasGuides ? Object.values(S.state.guides).map(g => {
      const secs = g.sections.filter(x => x.include);
      const done = secs.filter(x => S.isSectionRead(x.id)).length;
      return `<button class="item" data-act="guide:${g.id}">
        <div class="ic" style="background:#1e40af">📗</div>
        <div class="ibody"><b>${esc(g.title)}</b>
          <div style="margin-top:5px">${bar(pct(done, secs.length))}</div>
          <small>${done}/${secs.length} sections read${g.verified ? ' · you marked verified' : ' · not verified'}</small></div>
        <div class="iend">${pct(done, secs.length)}%</div></button>`;
    }).join('') : emptyState('📚', 'No guides imported yet',
      'Import your RRB guides (PDF/text) — they become the PRIMARY source for questions, mapped to the official syllabus.',
      '<button class="btn primary" data-act="import">Import guide</button>')}

    <p class="small center" style="margin:14px 2px 20px">Sources: GUIDE · VERIFIED RRB/PYQ (only when the guide itself states it) · OFFICIAL/VERIFIED · EXPECTED PRACTICE · AI-GENERATED PRACTICE.</p>
  `);

  $$('[data-act]').forEach(b => b.addEventListener('click', async () => {
    const [what, a] = b.dataset.act.split(':');
    if (what === 'resume' && resume) nav(resume.route);
    if (what === 'plan') nav('#/plan');
    if (what === 'subject') nav(`#/study/${a}`);
    if (what === 'guide') nav(`#/guide/${a}`);
    if (what === 'import') nav('#/guides/import');
    if (what === 'nexttask') nav('#/plan');
    if (what === 'drillweak' || what === 'revise' || what === 'teachzero') {
      const { startQuiz } = await import('./quiz.js');
      if (what === 'drillweak') startQuiz({ mode: 'weak', count: 10 }, 'Weak Concept Practice');
      if (what === 'revise') startQuiz({ mode: 'revision', count: 10 }, 'Revision Quiz');
      if (what === 'teachzero') {
        const w = weak.find(x => x.record.needsZero) || weak[0];
        if (w) nav(`#/concept/${w.concept.id}`);
        else toast('No weak concepts yet.');
      }
    }
  }));
  $$('[data-smart]').forEach(b => b.addEventListener('click', () => nav(`#/smart/${b.dataset.smart}`)));
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
