/* ============================================================
   QUIZ — hub + runner.
   Modes: guide, weak, subject, mixed, exam, revision, model-mixed.
   Wrong answer → full learning panel (spec §12) + ONE DIFFERENT mini
   question (answer hidden until checked). Correct → compact
   reinforcement (spec §14). Exam mode: timer + 1/3 negative marking.
   ============================================================ */
import { S, Bank, weakConcepts, revisionDue , guideUsableQuestions } from '../store.js';
import { SUBJECTS, SUBJECT_BY_ID, TOPIC_BY_ID, EXAM } from '../syllabus.js';
import { buildQuiz, pickMiniQuestion, bankCounts } from '../engine/selector.js';
import { recordAttempt, drillPlanAfterWrong, STATUS_INFO } from '../engine/mastery.js';
import { $, $$, esc, nl2br, setView, setTopbarActions, nav, sourceChip, diffChip, statusChip, toast, emptyState, modal, confirmModal } from './core.js';

let run = null; // active quiz run (in-memory; refresh aborts honestly)

export function startQuiz(spec, title) {
  const opts = {
    subjectId: spec.subjectId, topicId: spec.topicId, count: spec.count, guideId: spec.guideId,
    conceptId: spec.conceptId, methodId: spec.methodId,
    maxDifficulty: spec.maxDifficulty, difficulty: spec.difficulty,
    weakList: spec.mode === 'weak' ? weakConcepts().filter(w => !spec.subjectId || w.concept.subjectId === spec.subjectId) : undefined,
    dueList: spec.mode === 'revision' ? revisionDue().filter(x => x.overdue) : undefined,
    includeExtra: spec.includeExtra, name: title,
  };
  const built = buildQuiz(spec.mode, opts);
  if (!built.questions.length) {
    toast(spec.mode === 'guide'
      ? 'No guide questions available yet — import a guide first (Guides page).'
      : 'No questions available for this selection yet.');
    return;
  }
  run = {
    spec, title: title || built.title, mode: spec.mode,
    questions: built.questions, i: 0, correct: 0, wrong: 0,
    startedAt: Date.now(), qStart: Date.now(),
    timerEnd: null, negative: false,
    perTopic: {}, perSource: {}, wrongQs: [], answered: [],
    finished: false,
  };
  if (spec.mode === 'exam') {
    const mins = spec.minutes ?? S.state.settings.examMinutes;
    run.negative = spec.negative ?? S.state.settings.negative;
    run.timerEnd = spec.timer === false ? null : Date.now() + mins * 60000;
  }
  nav('#/run');
}

export function currentRun() { return run; }

/* ================= hub ================= */
export function quizHub() {
  const weak = weakConcepts();
  const due = revisionDue().filter(x => x.overdue);
  const hasGuides = Object.values(S.state.guides).some(g => guideUsableQuestions(g.id) > 0);
  const counts = bankCounts();

  const modes = [
    { id: 'guide', icon: '📗', name: 'Guide Quiz', desc: hasGuides ? 'Questions from your uploaded guides (guide-first priority).' : 'Import a guide first — button stays off until real guide questions exist.', disabled: !hasGuides },
    { id: 'weak', icon: '🎯', name: 'Weak Topic Quiz', desc: weak.length ? `${weak.length} weak concept${weak.length > 1 ? 's' : ''} — same model, DIFFERENT questions.` : 'No weak concepts yet. Weaknesses appear here after wrong answers.', disabled: !weak.length },
    { id: 'subject', icon: '📚', name: 'Subject Quiz', desc: 'Mixed questions from one subject.' },
    { id: 'mixed', icon: '🔀', name: 'Mixed Quiz', desc: 'All subjects, weighted by the indicative marks split.' },
    { id: 'exam', icon: '⏱️', name: 'Exam Mode', desc: `Timed mock · default ${S.state.settings.examQuestions} Q / ${S.state.settings.examMinutes} min · −1/3 negative marking.` },
    { id: 'revision', icon: '🔁', name: 'Revision Quiz', desc: due.length ? `${due.length} concept${due.length > 1 ? 's' : ''} due today.` : 'Nothing due right now. Due items appear as you learn.', disabled: !due.length },
  ];

  setTopbarActions('');
  setView(`
    <div class="pagehead"><h1>Quiz</h1><p>Question source is always shown. Guide questions come first; AI variants are always labeled.</p></div>
    <div class="card tight" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <span class="small"><b>Question bank:</b> ${counts.total} questions</span>
      ${SUBJECTS.map(s => `<span class="chip gray">${s.short}: ${counts[s.id]}</span>`).join('')}
      <span class="chip src-AI">+ unlimited fresh variants</span>
    </div>
    ${modes.map(m => `
      <button class="item" data-mode="${m.id}" ${m.disabled ? 'disabled style="opacity:.55"' : ''}>
        <div class="ic subbg-${m.id === 'guide' ? 'MATH' : m.id === 'weak' ? 'REASONING' : m.id === 'exam' ? 'GA' : 'SCIENCE'}">${m.icon}</div>
        <div class="ibody"><b>${esc(m.name)}</b><small>${esc(m.desc)}</small></div>
        <div class="iend">${m.disabled ? '' : 'start →'}</div>
      </button>`).join('')}
    <p class="small center" style="margin:10px 2px 16px">In practice, the SAME question is not repeated — when you are weak in a model, you get a DIFFERENT question of the SAME model.</p>
  `);
  $$('[data-mode]').forEach(b => b.addEventListener('click', () => {
    const m = b.dataset.mode;
    if (m === 'subject') subjectPicker();
    else if (m === 'exam') examConfig();
    else if (m === 'weak') startQuiz({ mode: 'weak', count: Math.min(Math.max(weak.length, 3), 10) }, 'Weak Topic Quiz');
    else if (m === 'mixed') startQuiz({ mode: 'mixed', count: 10 }, 'Mixed Quiz');
    else if (m === 'guide') guideQuizPicker();
    else if (m === 'revision') startQuiz({ mode: 'revision', count: Math.min(Math.max(due.length, 3), 10) }, 'Revision Quiz');
  }));
}

function subjectPicker() {
  modal({ title: 'Subject Quiz', body: `
    <div class="stack">
      ${SUBJECTS.map(s => `<button class="btn" data-subject="${s.id}" style="justify-content:flex-start">${esc(s.name)}</button>`).join('')}
    </div>`,
    actions: [{ label: 'Cancel' }],
    onMount: (root) => {
      $$('[data-subject]', root).forEach(b => b.addEventListener('click', () => {
        startQuiz({ mode: 'subject', subjectId: b.dataset.subject, count: 10 }, `${SUBJECT_BY_ID[b.dataset.subject].short} Quiz`);
      }));
    } });
}

function guideQuizPicker() {
  const guides = Object.values(S.state.guides);
  modal({ title: 'Guide Quiz — which guide?', body: `
    <div class="stack">
      ${guides.map(g => {
        const n = guideUsableQuestions(g.id);
        return `<button class="btn" data-guide="${g.id}" style="justify-content:flex-start" ${n ? '' : 'disabled'}>
          ${esc(g.title)} <span class="small">(${n} questions)</span></button>`;
      }).join('')}
      <label class="checkrow"><input type="checkbox" id="incExtra"> Include GUIDE EXTRA sections (outside official syllabus)</label>
    </div>`,
    actions: [{ label: 'Cancel' }],
    onMount: (root) => {
      $$('[data-guide]', root).forEach(b => b.addEventListener('click', () => {
        const includeExtra = $('#incExtra', root).checked;
        const g = S.state.guides[b.dataset.guide];
        startQuiz({ mode: 'guide', subjectId: null, count: 10, includeExtra, guideId: g.id }, `Guide Quiz — ${g.title}`);
      }));
    } });
}

export function examConfig() {
  const st = S.state.settings;
  modal({ title: 'Exam Mode setup', body: `
    <div class="field"><label>Number of questions</label>
      <div class="seg" id="exlen">
        ${[25, 50, st.examQuestions].map(n => `<button data-n="${n}" class="${n === st.examQuestions ? 'active' : ''}">${n === st.examQuestions && ![25, 50].includes(n) ? `${n} (full)` : n}</button>`).join('')}
      </div></div>
    <div class="switchrow"><span>Timer (${st.examMinutes} minutes)</span><input type="checkbox" id="extimer" checked></div>
    <div class="switchrow"><span>Negative marking (−1/3 per wrong)</span><input type="checkbox" id="exneg" ${st.negative ? 'checked' : ''}></div>
    <p class="small">Distribution target is indicative (25/25/40/10). If the bank has fewer questions in a subject, the mock fills from other subjects and tells you the real mix.</p>
    <p class="small">Bank right now: ${bankCounts().total} questions.</p>`,
    actions: [
      { label: 'Cancel' },
      { label: 'Start exam', cls: 'primary', onClick: (close, root) => {
        const n = +($('#exlen .active', root)?.dataset.n || st.examQuestions);
        const timer = $('#extimer', root).checked;
        const negative = $('#exneg', root).checked;
        startQuiz({ mode: 'exam', count: n, minutes: st.examMinutes, timer, negative }, 'Exam Mode');
      } },
    ],
    onMount: (root) => {
      $$('#exlen button', root).forEach(b => b.addEventListener('click', () => {
        $$('#exlen button', root).forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      }));
    } });
}

/* ================= runner ================= */
export function runPage() {
  if (!run) { nav('#/quiz'); return; }
  if (run.finished) return summaryPage();
  const q = run.questions[run.i];
  setTopbarActions(`<button class="tbtn" data-quit>✕ Quit</button>`);
  $('#topbar-actions [data-quit]')?.addEventListener('click', () => {
    confirmModal('Quit quiz?', 'Your answers so far are already saved to progress. Quit now?', () => finishRun(true), 'Quit');
  });

  setView(`
    <div class="qprog">
      <span class="qn">${run.i + 1} / ${run.questions.length}</span>
      <div class="bar" style="flex:1"><span style="width:${Math.round((run.i) / run.questions.length * 100)}%"></span></div>
      ${run.timerEnd ? `<span class="timer" id="qtimer">--:--</span>` : ''}
    </div>
    <div class="card">
      <div class="qhead">
        <div class="qmeta">
          <span class="chip blue">${esc(TOPIC_BY_ID[q.topicId]?.name || (q.subjectId ? SUBJECT_BY_ID[q.subjectId].short : 'Guide extra'))}</span>
          ${q.subtopicId ? `<span class="chip gray">${esc(q.subtopicId)}</span>` : ''}
          ${diffChip(q.difficulty)}
          ${sourceChip(q.source)}
          ${run.mode === 'exam' && run.negative ? '<span class="chip red">−1/3 wrong</span>' : ''}
          ${run.mode === 'model-mixed' ? '<span class="chip purple">model hidden</span>' : ''}
        </div>
      </div>
      <div class="qtext">${nl2br(q.text)}</div>
      <div id="opts">${q.options.map((o, i) => `
        <button class="opt" data-i="${i}"><span class="ol">${'abcd'[i] || '?'}</span><span>${esc(o)}</span></button>`).join('')}</div>
      <div class="row" style="margin-top:8px">
        <button class="btn primary" id="check" disabled>Check</button>
      </div>
      <div id="feedback"></div>
    </div>
    <p class="small center" style="margin-bottom:16px">${run.mode === 'exam' ? 'Exam mode — answer carefully, wrong answers cost ⅓ mark.' : 'Take your time — understanding beats speed here.'}</p>
  `);

  let chosen = -1;
  const optBtns = $$('#opts .opt');
  optBtns.forEach(b => b.addEventListener('click', () => {
    if (chosen >= 0) return;
    chosen = +b.dataset.i;
    optBtns.forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
    $('#check').disabled = false;
  }));
  $('#check').addEventListener('click', () => answer(chosen, q, optBtns));

  if (run.timerEnd) tickTimer();
}

function tickTimer() {
  const el = $('#qtimer');
  if (!el || !run || !run.timerEnd) return;
  const left = run.timerEnd - Date.now();
  if (left <= 0) { finishRun(false, true); return; }
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  el.classList.toggle('low', left < 60000);
  setTimeout(tickTimer, 1000);
}

function answer(chosen, q, optBtns) {
  const correct = chosen === q.answer;
  const timeMs = Date.now() - run.qStart;
  const events = recordAttempt(q, chosen, correct, run.mode, timeMs);

  run.answered.push({ qid: q.id, correct });
  const tKey = q.topicId || 'extra';
  run.perTopic[tKey] = run.perTopic[tKey] || { n: 0, c: 0 };
  run.perTopic[tKey].n++; if (correct) run.perTopic[tKey].c++;
  run.perSource[q.source] = run.perSource[q.source] || { n: 0 };
  run.perSource[q.source].n++;
  if (correct) run.correct++; else { run.wrong++; run.wrongQs.push({ q, chosen }); }

  optBtns.forEach((b, i) => {
    b.disabled = true;
    if (i === q.answer) b.classList.add('correct');
    if (i === chosen && !correct) b.classList.add('wrong');
  });
  $('#check').style.display = 'none';

  const mini = !correct ? pickMiniQuestion(q) : null;
  const dp = q.conceptId ? drillPlanAfterWrong(q.conceptId) : null;
  const drillCount = dp?.count && dp.count > 1 ? dp.count : null;

  $('#feedback').innerHTML = correct ? correctPanel(q) : wrongPanel(q, chosen, { mini, drillCount, events });

  if (correct) {
    $('#nextq').addEventListener('click', nextQ);
  } else {
    if (mini) bindMini(mini);
    $('#nextq')?.addEventListener('click', nextQ);
    $('#drillbtn')?.addEventListener('click', () => {
      startQuiz({ mode: 'practice', conceptId: q.conceptId, methodId: q.methodId, topicId: q.topicId, subjectId: q.subjectId, count: drillCount || 2, maxDifficulty: dp?.teachZero ? 1 : undefined },
        `Drill — ${q.conceptId ? Bank.concepts.get(q.conceptId)?.title : TOPIC_BY_ID[q.topicId]?.name || 'weak model'}`);
    });
  }
}

function nextQ() {
  run.i++;
  run.qStart = Date.now();
  if (run.i >= run.questions.length) finishRun(false);
  else runPage();
}

/* ---- compact reinforcement (spec §14) ---- */
function correctPanel(q) {
  const info = linkedInfo(q);
  return `
  <div class="panel good">
    <div class="panel-h">✅ Correct!</div>
    <div class="panel-b">
      <div class="plabel">Concept</div><p class="mb0">${esc(q.tests || info.conceptTitle || '—')}</p>
      ${info.rule ? `<div class="plabel">Formula / rule / key fact</div><div class="formula-box" style="margin:4px 0">${nl2br(info.rule)}</div>` : ''}
      ${q.recall || info.recall ? `<div class="plabel">Exam recall</div><div class="recall-box mb0">${esc(q.recall || info.recall)}</div>` : ''}
      ${run.mode === 'model-mixed' && q.methodId && Bank.methods.get(q.methodId) ? `
        <div class="plabel">Model used (hidden until now)</div>
        <p class="mb0"><b>${esc(Bank.methods.get(q.methodId).name)}</b> — recognize by: ${esc(Bank.methods.get(q.methodId).recognize)}</p>` : ''}
    </div>
  </div>
  <button class="btn primary block" id="nextq" style="margin-top:10px">${run.i + 1 >= run.questions.length ? 'Finish ▸' : 'Next question ▸'}</button>`;
}

/* ---- full learning panel (spec §12) ---- */
function linkedInfo(q) {
  const concept = q.conceptId ? Bank.concepts.get(q.conceptId) : null;
  const method = q.methodId ? Bank.methods.get(q.methodId) : null;
  let starterForTopic = null;
  if (!concept && q.topicId) starterForTopic = [...Bank.concepts.values()].find(c => c.topicId === q.topicId);
  const fBlock = concept?.blocks.find(b => b.t === 'formula');
  const nrBlock = concept?.blocks.find(b => b.t === 'norule');
  const memBlock = concept?.blocks.find(b => b.t === 'memory');
  const trapBlock = concept?.blocks.find(b => b.t === 'trap');
  const recBlock = concept?.blocks.find(b => b.t === 'recall');
  return {
    concept, method, starterForTopic,
    conceptTitle: concept?.title || method?.name || null,
    rule: q.formulaHint || method?.formula || (fBlock ? fBlock.x : null) || (nrBlock ? 'No formula needed — use this rule: ' + nrBlock.x : null),
    recall: q.recall || recBlock?.x || null,
    memory: q.memory || (memBlock ? { tech: memBlock.tech, x: memBlock.x } : null),
    trap: q.trap || trapBlock?.x || null,
    basic: concept ? concept.blocks.find(b => b.t === 'p')?.x : null,
  };
}

function wrongPanel(q, chosen, { mini, drillCount, events }) {
  const info = linkedInfo(q);
  const whyWrong = q.wrongWhy?.[chosen]
    || 'Your option does not follow the correct method — compare it with the step-by-step solution below.';
  const whyRight = q.wrongWhy?.[q.answer] || (q.solution?.length ? q.solution[0] : 'See the step-by-step solution below.');
  const isGuideQ = q.source === 'GUIDE' || q.source === 'PYQ';
  const zeroFlag = events?.some(e => e.type === 'teach-from-zero');
  const weaknessReturned = events?.some(e => e.type === 'weakness-returned');
  const fromGuide = isGuideQ && (q.explanation || q.solution?.length);

  return `
  <div class="panel bad">
    <div class="panel-h">❌ Wrong — Learning panel</div>
    <div class="panel-b">
      ${kv([
        ['SUBJECT', q.subjectId ? SUBJECT_BY_ID[q.subjectId].name : 'Guide extra'],
        ['TOPIC', TOPIC_BY_ID[q.topicId]?.name || '—'],
        ['SUBTOPIC', q.subtopicId || '—'],
        ['CONCEPT / METHOD', info.conceptTitle || (q.topicId ? 'topic-level question' : '—')],
        ['SOURCE', sourceChip(q.source) + ' <span class="small">' + esc(q.sourceRef || '') + '</span>'],
      ])}

      <div class="plabel">What is this question testing?</div>
      <p class="mb0">${esc(q.tests || info.conceptTitle || '—')}</p>

      <div class="plabel">Correct answer</div>
      <p class="mb0"><b>${'abcd'[q.answer] || ''}) ${esc(q.options[q.answer])}</b></p>

      <div class="plabel">Why your answer is wrong</div>
      <p class="mb0">${esc(whyWrong)}</p>

      <div class="plabel">Why the correct answer is right</div>
      <p class="mb0">${esc(whyRight)}</p>

      ${info.basic || info.starterForTopic ? `
      <div class="plabel">Basic concept from zero</div>
      <p class="mb0">${info.basic ? nl2br(info.basic) : esc(info.starterForTopic.summary) + ' <span class="small">(from Starter Pack, not from the guide)</span>'}</p>
      ${info.concept ? `<button class="btn small" data-zero="${info.concept.id}">🌱 Open full Teach-From-Zero lesson</button>` : ''}
      ${!info.concept && info.starterForTopic ? `<button class="btn small" data-zero="${info.starterForTopic.id}">🌱 Open a Starter Pack lesson for this topic</button>` : ''}
      ` : ''}

      ${info.rule ? `<div class="plabel">Formula / rule / key fact</div><div class="formula-box">${nl2br(info.rule)}</div>` : ''}
      ${info.method ? `<div class="plabel">Model used</div><p class="mb0"><b>${esc(info.method.name)}</b> — recognize by: ${esc(info.method.recognize)}</p>` : ''}

      <div class="plabel">Step-by-step solution</div>
      ${q.solution?.length ? `<ol class="steps">${q.solution.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        ${fromGuide ? '<p class="small mb0">Solution captured from your uploaded guide. Not independently verified.</p>' : ''}`
        : '<p class="small mb0">No step-by-step was captured with this question. ' +
          (isGuideQ ? 'Open the guide section (Guides page) to read the original explanation.' : 'See the concept lesson linked above.') + '</p>'}

      ${info.trap ? `<div class="plabel">Common exam trap</div><div class="trap-box mb0">${esc(info.trap)}</div>` : ''}
      ${info.memory ? `<div class="plabel">Memory method — ${esc(info.memory.tech)}</div><div class="memory-box mb0">${esc(info.memory.x)}</div>` : ''}
      ${info.recall ? `<div class="plabel">5-second exam recall</div><div class="recall-box mb0">${esc(info.recall)}</div>` : ''}

      ${zeroFlag ? `<div class="dangerbanner" style="margin:10px 0 0">You missed this 3 times. Teach-From-Zero is recommended — open the lesson above and start from the basic idea.</div>` : ''}
      ${weaknessReturned ? `<div class="warnbanner" style="margin:10px 0 0">This concept had improved — the weakness returned. It will come back in revision with different questions.</div>` : ''}
    </div>
  </div>

  ${mini ? `
  <div class="card" id="minicard">
    <div class="plabel" style="margin-top:0">One DIFFERENT mini question — same idea, new question</div>
    <p class="qtext" style="font-size:15px">${nl2br(mini.text)}</p>
    <div id="miniopts">${mini.options.map((o, i) => `
      <button class="opt" data-mi="${i}"><span class="ol">${'abcd'[i]}</span><span>${esc(o)}</span></button>`).join('')}</div>
    <div id="minifb"></div>
  </div>` : ''}

  <div class="row" style="margin:12px 0 20px">
    ${drillCount ? `<button class="btn warn" id="drillbtn">Drill ${drillCount} more different question${drillCount > 1 ? 's' : ''} of this model</button>` : ''}
    <button class="btn primary" id="nextq" style="margin-left:auto">${run.i + 1 >= run.questions.length ? 'Finish ▸' : 'Next question ▸'}</button>
  </div>`;
}

function kv(pairs) {
  return `<dl class="kv">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

function bindMini(mini) {
  let chosen = -1;
  const btns = $$('#miniopts .opt');
  btns.forEach(b => b.addEventListener('click', () => {
    if (chosen >= 0) return;
    chosen = +b.dataset.mi;
    btns.forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
    const checkBtn = document.createElement('button');
    checkBtn.className = 'btn primary';
    checkBtn.textContent = 'Check';
    checkBtn.style.marginTop = '8px';
    $('#minifb').innerHTML = '';
    $('#minifb').appendChild(checkBtn);
    checkBtn.addEventListener('click', () => {
      const ok = chosen === mini.answer;
      const timeMs = 15000;
      recordAttempt(mini, chosen, ok, 'practice', timeMs);
      btns.forEach((b2, i) => {
        b2.disabled = true;
        if (i === mini.answer) b2.classList.add('correct');
        if (i === chosen && !ok) b2.classList.add('wrong');
      });
      checkBtn.remove();
      $('#minifb').innerHTML = `
        <div class="panel ${ok ? 'good' : 'bad'}" style="margin-top:10px">
          <div class="panel-h">${ok ? '✅ Correct — well done!' : '❌ Still tricky'}</div>
          <div class="panel-b">
            <ol class="steps">${(mini.solution || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol>
            ${ok ? '' : '<p class="small mb0">The full lesson above is worth one more read. This concept stays in your weak list until you get 3 in a row right.</p>'}
          </div>
        </div>`;
    });
  }));
  $$('[data-zero]').forEach(b => b.addEventListener('click', () => nav(`#/concept/${b.dataset.zero}`)));
}

/* ================= summary ================= */
function finishRun(quit, timeout = false) {
  if (!run || run.finished) return;
  run.finished = true;
  run.finishedAt = Date.now();
  run.timeout = timeout;
  const day = S.day();
  day.min += Math.max(0, Math.round((run.finishedAt - run.startedAt) / 60000));
  S.save();
  summaryPage();
}

function summaryPage() {
  const r = run;
  const total = r.answered.length;
  const acc = total ? Math.round((r.correct / total) * 100) : 0;
  let score = r.correct;
  if (r.mode === 'exam' && r.negative) score = r.correct - r.wrong / 3;
  const topics = Object.entries(r.perTopic).map(([tid, v]) => ({ tid, ...v, pct: Math.round((v.c / v.n) * 100) }));
  const weakNow = weakConcepts();

  setTopbarActions('');
  setView(`
    <div class="pagehead"><h1>${r.timeout ? '⏱️ Time up — ' : ''}${esc(r.title)} — result</h1></div>
    <div class="card center">
      <div class="statgrid">
        <div class="stat"><b>${total}</b><small>ANSWERED</small></div>
        <div class="stat"><b style="color:var(--ok)">${r.correct}</b><small>CORRECT</small></div>
        <div class="stat"><b style="color:var(--bad)">${r.wrong}</b><small>WRONG</small></div>
        <div class="stat"><b>${acc}%</b><small>ACCURACY</small></div>
        ${r.mode === 'exam' ? `<div class="stat"><b>${r.negative ? Math.round(score * 100) / 100 : r.correct}</b><small>SCORE${r.negative ? ' (−⅓)' : ''}</small></div>` : ''}
        <div class="stat"><b>${Math.max(0, Math.round((r.finishedAt - r.startedAt) / 60000))}</b><small>MINUTES</small></div>
      </div>
    </div>

    <div class="card">
      <div class="plabel" style="margin-top:0">By topic</div>
      ${topics.length ? topics.map(t => `
        <div class="prow"><span class="plabel">${esc(TOPIC_BY_ID[t.tid]?.name || 'Guide extra')}</span>
          <div class="bar ${t.pct >= 60 ? 'ok' : t.pct >= 40 ? 'warn' : ''}"><span style="width:${t.pct}%"></span></div>
          <span class="pval">${t.c}/${t.n}</span></div>`).join('') : '<p class="small mb0">No questions answered.</p>'}
      <div class="plabel">By source</div>
      <div class="chips-row">${Object.entries(r.perSource).map(([s, v]) => `${sourceChip(s)} <small>×${v.n}</small>`).join('') || '<span class="small">—</span>'}</div>
    </div>

    ${r.wrongQs.length ? `
    <div class="card">
      <div class="plabel" style="margin-top:0">Review wrong answers (${r.wrongQs.length})</div>
      ${r.wrongQs.map(({ q }, i) => `
        <details style="border:1px solid var(--line);border-radius:10px;padding:8px 12px;margin-bottom:8px">
          <summary style="cursor:pointer;font-weight:600;font-size:13.5px">${i + 1}. ${esc(q.text.slice(0, 90))}${q.text.length > 90 ? '…' : ''}</summary>
          <p class="qtext" style="font-size:14px">${nl2br(q.text)}</p>
          <p class="small"><b>Correct:</b> ${'abcd'[q.answer]}) ${esc(q.options[q.answer])}</p>
          ${q.solution?.length ? `<ol class="steps">${q.solution.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
          ${q.conceptId ? `<button class="btn small" data-zero="${q.conceptId}">🌱 Open Teach-From-Zero lesson</button>` : ''}
        </details>`).join('')}
    </div>` : ''}

    <div class="card">
      ${weakNow.length ? `
        <div class="plabel" style="margin-top:0">Weak concept bank</div>
        <p class="small">You currently have <b>${weakNow.length}</b> weak/improving concept${weakNow.length > 1 ? 's' : ''}. They will return in revision with DIFFERENT questions until mastered.</p>
        ${weakNow.slice(0, 5).map(w => `<div class="row between" style="padding:4px 0">
          <span style="font-size:13px">${esc(w.concept.title)}</span>${statusChip(w.record.status)}</div>`).join('')}
        <button class="btn warn block" data-act="drillweak" style="margin-top:10px">Drill weak concepts now (same model, new questions)</button>`
        : '<p class="small mb0">✅ No weak concepts from this run. Keep going with new topics or revision.</p>'}
    </div>

    <div class="row" style="margin:8px 0 20px">
      <button class="btn primary" data-act="again">Similar practice again</button>
      <button class="btn" data-act="home">Home</button>
    </div>
  `);

  /* if a smart study session is running, offer to return to it */
  import('./plan.js').then(({ activeSmartSession }) => {
    const sm = activeSmartSession();
    if (sm && !sm.finished && sm.doneIdx.length < sm.blocks.length) {
      const btn = document.createElement('button');
      btn.className = 'btn warn';
      btn.textContent = '↩ Return to smart session';
      btn.addEventListener('click', () => nav(`#/smart/${sm.minutes}`));
      $('[data-act="home"]')?.parentElement.appendChild(btn);
    }
  });

  $$('[data-zero]').forEach(b => b.addEventListener('click', () => nav(`#/concept/${b.dataset.zero}`)));
  $$('[data-act]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'drillweak') startQuiz({ mode: 'weak', count: 10 }, 'Weak Concept Drill');
    if (a === 'again') {
      const spec = { ...r.spec };
      startQuiz(spec, r.title);
    }
    if (a === 'home') { run = null; nav('#/home'); }
  }));
}
