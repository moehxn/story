/* ============================================================
   PLAN — 10-day adaptive study plan + smart study sessions.
   Every day covers ALL subjects (unless manually changed).
   Tasks auto-complete from real activity; manual toggle allowed.
   ============================================================ */
import { S, Bank, weakConcepts } from '../store.js';
import { buildPlan, rebuildRemaining, currentPlanDay, planDayProgress, evaluateTask } from '../engine/plan.js';
import { buildSmartSession } from '../engine/smart.js';
import { SUBJECT_BY_ID, TOPIC_BY_ID } from '../syllabus.js';
import { $, $$, esc, setView, setTopbarActions, nav, bar, pct, fmtDate, toast, confirmModal } from './core.js';

const KIND_META = {
  LEARN: { icon: '🌱', cls: 'blue' },
  GUIDE: { icon: '📗', cls: 'blue' },
  PRACTICE: { icon: '✍️', cls: 'green' },
  WEAK: { icon: '🎯', cls: 'red' },
  REVISE: { icon: '🔁', cls: 'amber' },
  EXAM: { icon: '⏱️', cls: 'purple' },
  MIXED: { icon: '🔀', cls: 'gray' },
};

export function planPage(dayParam) {
  let plan = S.state.plan;
  if (!plan) plan = buildPlan(10);
  const today = S.today();
  const showDay = dayParam ? plan.days.find(d => d.dayNum === +dayParam) : (currentPlanDay() || plan.days[0]);
  const dayProg = planDayProgress(showDay);

  setTopbarActions('');
  setView(`
    <div class="pagehead"><h1>10-day study plan</h1>
      <p>Adaptive: unfinished syllabus first, then important guide material, weak concepts, revision due, and exam-style practice — every day, all four subjects.</p></div>

    <div class="daygrid">
      ${plan.days.map(d => {
        const p = planDayProgress(d);
        return `<button class="daytab ${d.date === showDay.date ? 'active' : ''} ${d.date < today ? 'done' : ''}" data-day="${d.dayNum}">
          <span>D${d.dayNum}</span><b>${fmtDate(d.date)}</b>
          <span class="small">${p.done}/${p.total}</span></button>`;
      }).join('')}
    </div>

    <div class="card tight">
      <div class="row between"><b>Day ${showDay.dayNum} — ${fmtDate(showDay.date)}
        ${showDay.date === today ? '<span class="chip slate">TODAY</span>' : showDay.date < today ? '<span class="chip gray">past</span>' : ''}</b>
        <span class="small">${dayProg.done}/${dayProg.total} done</span></div>
      <div style="margin-top:8px">${bar(pct(dayProg.done, dayProg.total))}</div>
    </div>

    ${showDay.tasks.map(t => {
      const m = KIND_META[t.kind] || KIND_META.MIXED;
      const done = evaluateTask(t, showDay.date);
      return `<div class="task ${done ? 'done' : ''}" data-task="${t.id}">
        <button class="tcheck" data-tog="${t.id}">${done ? '✓' : ''}</button>
        <div class="tbody">
          <b>${m.icon} ${esc(t.label)}</b>
          <small>${t.subjectId ? SUBJECT_BY_ID[t.subjectId].name + ' · ' : ''}${t.kind}${t.kind === 'LEARN' && t.conceptIds?.length ? ' · ' + t.conceptIds.length + ' concepts' : ''}</small>
          <div class="row" style="margin-top:6px">
            <button class="btn small primary" data-start="${t.id}">Start</button>
            <span class="small" style="align-self:center">${done ? 'done ✓' : ''}</span>
          </div>
        </div>
      </div>`;
    }).join('')}

    <div class="card">
      <div class="row">
        <button class="btn" data-act="rebuild">Rebuild remaining days</button>
        <button class="btn ghost" data-act="settings">Exam date & settings</button>
      </div>
      <p class="small mb0" style="margin-top:8px">Rebuilding keeps completed history and re-plans only future days from your CURRENT weak points and progress. You can also tick tasks manually.</p>
    </div>
  `);

  $$('[data-day]').forEach(b => b.addEventListener('click', () => planPage(b.dataset.day)));
  $$('[data-tog]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const t = showDay.tasks.find(x => x.id === b.dataset.tog);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? new Date().toISOString() : null;
    S.save();
    planPage(String(showDay.dayNum));
  }));
  $$('[data-start]').forEach(b => b.addEventListener('click', async () => startTask(showDay.tasks.find(x => x.id === b.dataset.start))));
  $$('[data-act]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.act === 'rebuild') {
      confirmModal('Rebuild the remaining days?', 'Future days will be re-planned from your current progress, weak concepts and due revisions. Completed days are kept.', () => {
        rebuildRemaining(); toast('Plan rebuilt ✓'); planPage();
      });
    }
    if (b.dataset.act === 'settings') nav('#/more');
  }));
}

async function startTask(t) {
  if (!t) return;
  const { startQuiz } = await import('./quiz.js');
  switch (t.kind) {
    case 'LEARN': {
      const c = (t.conceptIds || []).map(id => Bank.concepts.get(id)).find(Boolean);
      if (c) nav(`#/concept/${c.id}`);
      else nav('#/study');
      break;
    }
    case 'GUIDE': {
      const sid = (t.sectionIds || [])[0];
      if (sid) {
        const [ , guideId, idx] = sid.split(':');
        nav(`#/reader/${guideId}/${idx}`);
      } else nav('#/guides');
      break;
    }
    case 'PRACTICE': startQuiz({ mode: 'subject', subjectId: t.subjectId, count: Math.min(t.qty || 8, 10) }, `${SUBJECT_BY_ID[t.subjectId].short} Practice`);
      break;
    case 'WEAK': startQuiz({ mode: 'weak', subjectId: t.subjectId || undefined, count: Math.min(t.qty || 4, 10) }, 'Weak Concept Drill');
      break;
    case 'REVISE': startQuiz({ mode: 'revision', count: 10 }, 'Revision Quiz');
      break;
    case 'EXAM': startQuiz({ mode: 'exam', count: t.halfMock ? 50 : S.state.settings.examQuestions }, t.halfMock ? 'Half Mock Exam' : 'Full Mock Exam');
      break;
    case 'MIXED': startQuiz({ mode: 'mixed', count: t.qty || 10 }, 'Mixed Practice');
      break;
  }
}

/* ============================================================
   SMART STUDY (10/20/30/60 min)
   ============================================================ */
let smart = null;

export function activeSmartSession() { return smart; }

export function smartPage(minutes) {
  const m = Math.max(5, Math.min(120, +minutes || 10));
  if (!smart || smart.minutes !== m || smart.finished) {
    smart = { ...buildSmartSession(m), doneIdx: [], finished: false, startedAt: Date.now() };
  }
  const weakN = weakConcepts().length;

  setTopbarActions(`<button class="tbtn" data-back>‹ Back</button>`);
  setView(`
    <div class="pagehead"><h1>Smart study — ${m} minutes</h1>
      <p>Allocated from your real state right now: ${weakN} weak concept${weakN === 1 ? '' : 's'}, revision due, unread content — time flows to what matters.</p></div>

    ${smart.blocks.map((b, i) => {
      const done = smart.doneIdx.includes(i);
      const active = !done && smart.doneIdx.length === i;
      const meta = {
        teach: { icon: '🧑‍🏫', name: 'Weak concept teaching' },
        revise: { icon: '🔁', name: 'Revision (due today)' },
        read: { icon: '📖', name: b.label },
        practice: { icon: '✍️', name: 'Practice' },
      }[b.kind];
      return `<div class="card tight ${active ? '' : ''}" style="${active ? 'border-color:var(--primary);border-width:2px' : done ? 'opacity:.65' : ''}">
        <div class="row between">
          <b>${meta.icon} ${esc(b.label)}</b>
          <span class="chip ${done ? 'green' : active ? 'blue' : 'gray'}">${done ? 'done ✓' : b.minutes + ' min'}</span>
        </div>
        ${active ? renderBlockBody(b) : ''}
        ${active ? `<div class="row" style="margin-top:10px">
          ${b.kind === 'practice' ? '' : ''}
          <button class="btn small ${b.kind === 'practice' ? 'primary' : ''}" data-blockstart="${i}">${b.kind === 'practice' ? `Start ${b.count}-question practice` : b.kind === 'revise' ? 'Start revision questions' : 'Open & study'}</button>
          <button class="btn small ghost" data-blockdone="${i}">Done — next block</button>
        </div>` : ''}
      </div>`;
    }).join('')}

    <div class="card center">
      <p class="small mb0">Block ${Math.min(smart.doneIdx.length + 1, smart.blocks.length)} of ${smart.blocks.length}
      · real study time today: <b>${S.day().min} min</b>, <b>${S.day().q}</b> questions answered</p>
      ${smart.doneIdx.length >= smart.blocks.length ? `
        <div style="margin-top:10px"><b>🎉 Smart session complete!</b>
        <div class="row" style="justify-content:center;margin-top:8px">
          <button class="btn primary" data-act="again">Another ${m}-minute round</button>
          <button class="btn" data-act="home">Home</button></div></div>` : ''}
    </div>
  `);

  $('#topbar-actions [data-back]')?.addEventListener('click', () => nav('#/home'));
  $$('[data-open]').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.open;
    if (v.startsWith('guide:')) {
      const parts = v.split(':'); // guide:g:<gid>:<idx>
      nav(`#/reader/${parts[2]}/${parts[3]}`);
    } else nav(`#/concept/${v}`);
  }));
  $$('[data-blockstart]').forEach(b => b.addEventListener('click', () => startBlock(smart.blocks[+b.dataset.blockstart])));
  $$('[data-blockdone]').forEach(b => b.addEventListener('click', () => {
    smart.doneIdx.push(+b.dataset.blockdone);
    if (smart.doneIdx.length >= smart.blocks.length) { smart.finished = true; toast('Smart session complete 🎉'); }
    S.save();
    smartPage(smart.minutes);
  }));
  $$('[data-act]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.act === 'again') smartPage(smart.minutes);
    if (b.dataset.act === 'home') nav('#/home');
  }));
}

function renderBlockBody(b) {
  if (b.kind === 'teach' || b.kind === 'revise') {
    return (b.conceptIds || []).map(id => {
      const c = Bank.concepts.get(id);
      if (!c) return '';
      const r = S.state.concepts[id];
      return `<div class="row between" style="padding:5px 0">
        <span style="font-size:13.5px;font-weight:600">${esc(c.title)}</span>
        <button class="btn small" data-open="${id}">Open lesson</button></div>`;
    }).join('');
  }
  if (b.kind === 'read') {
    return (b.items || []).map(it => `<div class="row between" style="padding:5px 0">
      <span style="font-size:13.5px;font-weight:600">${esc(it.type === 'guide' ? it.sec.title : (Bank.concepts.get(it.id)?.title || ''))}</span>
      <button class="btn small" data-open="${it.type}:${it.id}">Open</button></div>`).join('');
  }
  return '';
}

async function startBlock(b) {
  const { startQuiz } = await import('./quiz.js');
  if (b.kind === 'practice') {
    startQuiz({ mode: 'mixed', count: b.count }, 'Smart practice');
  } else if (b.kind === 'revise') {
    startQuiz({ mode: 'revision', count: Math.max(3, b.conceptIds.length * 2) }, 'Smart revision');
  }
  // teach/read blocks open via inline buttons
}
