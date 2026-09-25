/* ============================================================
   REVISION — spaced repetition hub (spec §16): due today, overdue,
   upcoming schedule, revision quiz with DIFFERENT questions.
   ============================================================ */
import { S, Bank, weakConcepts, revisionDue } from '../store.js';
import { TOPIC_BY_ID, SUBJECT_BY_ID } from '../syllabus.js';
import { INTERVALS } from '../engine/mastery.js';
import { $, $$, esc, setView, setTopbarActions, nav, statusChip, emptyState, fmtDate, toast } from './core.js';

export function revisionPage() {
  const all = revisionDue();
  const due = all.filter(x => x.overdue);
  const upcoming = all.filter(x => !x.overdue).slice(0, 12);
  const weak = weakConcepts();

  setTopbarActions('');
  setView(`
    <div class="pagehead"><h1>Revision</h1>
      <p>Spaced revision: a concept returns after 1, 2, 4, 7, 10… days — always with a DIFFERENT question. Wrong answers bring it back tomorrow.</p></div>

    <div class="card">
      ${actionButtons([
        { id: 'quiz', label: `START REVISION QUIZ${due.length ? ` (${Math.min(due.length, 10)} due)` : ''}`, cls: 'primary', emoji: '🔁', block: true, disabled: !due.length },
      ])}
      ${due.length ? '' : '<p class="small mb0" style="margin-top:8px">Nothing due today. Due dates appear automatically as you learn — or after any wrong answer (next day).</p>'}
    </div>

    ${due.length ? `
    <div class="section-label">Due now (${due.length})</div>
    ${due.map(d => conceptRow(d))}` : ''}

    ${upcoming.length ? `
    <div class="section-label">Coming up</div>
    ${upcoming.map(d => conceptRow(d))}` : ''}

    ${weak.length ? `
    <div class="section-label">Weak concept bank (${weak.length})</div>
    <div class="card tight">
      ${weak.map(w => `<div class="row between" style="padding:6px 0;border-bottom:1px dashed var(--line)">
        <div><b style="font-size:13.5px">${esc(w.concept.title)}</b><br>
        <span class="small">${esc(TOPIC_BY_ID[w.concept.topicId]?.name || '')} · wrong ${w.record.wrong} · right ${w.record.correct} · streak ${w.record.streak}✓</span></div>
        ${statusChip(w.record.status)}${w.record.needsZero ? '<span class="chip red">teach zero</span>' : ''}
      </div>`).join('')}
      <p class="small" style="margin-top:10px">A concept becomes MASTERED only after 3 correct in a row including a mixed/exam-style question — never after one correct answer.</p>
    </div>` : ''}

    <div class="section-label">How the schedule works</div>
    <div class="card tight">
      <div class="kmap">Learn <span class="arr">→</span> +1 day <span class="arr">→</span> +2 days <span class="arr">→</span> +4 days <span class="arr">→</span> +7 days <span class="arr">→</span> +10 days <span class="arr">→</span> longer</div>
      <p class="small mb0" style="margin-top:8px">Intervals used: ${INTERVALS.join(', ')} days. Miss a question → the concept resets to tomorrow and goes back to WEAK.</p>
    </div>
  `);

  function conceptRow(d) {
    return `<button class="item" data-cid="${d.concept.id}">
      <div class="ic ${d.overdue ? '' : ''}" style="background:${d.overdue ? '#b91c1c' : '#64748b'}">${d.overdue ? '!' : '⏳'}</div>
      <div class="ibody"><b>${esc(d.concept.title)}</b>
        <small>${esc(TOPIC_BY_ID[d.concept.topicId]?.name || '')} · status ${d.record.status} · streak ${d.record.streak}✓</small></div>
      <div class="iend"><span class="chip ${d.overdue ? 'red' : 'gray'}">${d.overdue ? 'DUE' : fmtDate(d.dueOn)}</span></div>
    </button>`;
  }

  $('[data-act="quiz"]')?.addEventListener('click', async () => {
    const { startQuiz } = await import('./quiz.js');
    startQuiz({ mode: 'revision', count: 10 }, 'Revision Quiz');
  });
  $$('[data-cid]').forEach(b => b.addEventListener('click', () => nav(`#/concept/${b.dataset.cid}`)));

  // small helper reuse
  function actionButtons(list) {
    return `<div class="stack">${list.map(b =>
      `<button class="btn ${b.cls || ''} block" data-act="${b.id}" ${b.disabled ? 'disabled' : ''}>
        <span>${b.emoji || ''}</span><span>${esc(b.label)}</span></button>`).join('')}</div>`;
  }
}
