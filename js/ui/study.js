/* ============================================================
   STUDY — subjects → topics → subtopics/concepts → guide content
   → learn → practice. Includes Teach-From-Zero concept renderer
   (subject-specific styles) and the Maths Method Trainer.
   ============================================================ */
import { S, Bank, topicProgress, subjectProgress, contentUnits } from '../store.js';
import { SUBJECTS, SUBJECT_BY_ID, TOPIC_BY_ID, topicsOf } from '../syllabus.js';
import { startQuiz } from './quiz.js';
import { weakConcepts } from '../store.js';
import { $, $$, esc, nl2br, setView, setTopbarActions, nav, sourceChip, statusChip, bar, prow, pct, emptyState, actionButtons, bindActions, toast } from './core.js';

/* ================= subject list ================= */
export function studyHome() {
  const extras = [];
  for (const g of Object.values(S.state.guides)) {
    for (const sec of g.sections) if (sec.include && sec.extraBucket && !sec.inSyllabus) extras.push({ g, sec });
  }
  let html = `
    <div class="pagehead"><h1>Study</h1><p>Official syllabus → topics → concepts → guide content → practice.</p></div>
    <div class="warnbanner">📘 Subject-wise distribution (25 + 25 + 40 + 10) is indicative. The app never assumes an exact paper split.</div>
    ${SUBJECTS.map(s => {
      const p = subjectProgress(s.id);
      return `<button class="item" data-act="sub:${s.id}">
        <div class="ic subbg-${s.id}">${esc(s.icon)}</div>
        <div class="ibody"><b>${esc(s.name)}</b>
          <small>${s.questions} Q / ${s.marks} marks (indicative) · ${p.conceptsTotal ? p.conceptsTotal + ' concepts' : 'no concepts yet'}${p.hasContent ? '' : ''}</small>
          <div style="margin-top:6px">${bar(p.contentPct)}</div>
          <small>${p.hasContent ? `Guide content ${p.contentPct}% · Concepts mastered ${p.mastered}/${p.conceptsTotal} · Weak ${p.weak}` : 'Not started'}</small>
        </div>
        <div class="iend">${p.hasContent ? p.contentPct + '%' : '→'}</div>
      </button>`;
    }).join('')}
    ${extras.length ? `
      <div class="section-label">Guide extra — not in the official syllabus</div>
      ${extras.map(x => `<button class="item" data-act="extra:${x.g.id}:${x.sec.index}">
        <div class="ic" style="background:#9a3412">＋</div>
        <div class="ibody"><b>${esc(x.sec.title)}</b><small>GUIDE EXTRA · from “${esc(x.g.title)}”</small></div>
        <div class="iend">read →</div></button>`).join('')}
      <p class="small" style="margin:4px 2px 10px">These guide chapters are outside the official RRB syllabus. They stay separate so you can focus on the actual syllabus first.</p>` : ''}
  `;
  setView(html);
  $$('[data-act]').forEach(b => b.addEventListener('click', () => {
    const [what, a, c] = b.dataset.act.split(':');
    if (what === 'sub') nav(`#/study/${a}`);
    if (what === 'extra') nav(`#/reader/${a}/${c}`);
  }));
}

/* ================= subject page ================= */
export function subjectPage(subjectId) {
  const s = SUBJECT_BY_ID[subjectId];
  if (!s) return nav('#/study');
  const p = subjectProgress(subjectId);
  const topics = topicsOf(subjectId);
  const weak = p.weakList.length;
  const hasGuides = Object.keys(S.state.guides).length > 0;

  const topicItems = topics.map(t => {
    const tp = topicProgress(t.id);
    const isCA = t.id === 'current-affairs';
    const hasGuideContent = tp.content.total > tp.concepts;
    return `<button class="item" data-act="topic:${t.id}">
      <div class="ic subbg-${subjectId}" style="opacity:.9">${esc(TOPIC_BY_ID[t.id].name[0])}</div>
      <div class="ibody"><b>${esc(t.name)}</b>
        <small>${tp.concepts ? `${tp.mastered}/${tp.concepts} mastered · ` : ''}${isCA && !hasGuideContent ? 'needs a current-affairs source' :
          tp.content.total ? `content ${pct(tp.content.done, tp.content.total)}% · questions ${pct(tp.questions.done, tp.questions.total)}%` : 'not started'}</small>
        <div style="margin-top:6px">${bar(pct(tp.content.done, tp.content.total))}</div>
      </div>
      <div class="iend">${tp.weak ? `<span class="chip red">${tp.weak} weak</span><br>` : ''}${tp.dueRev ? `<span class="chip amber">rev due</span>` : ''}</div>
    </button>`;
  }).join('');

  const firstUnlearned = [...Bank.concepts.values()].find(c => c.subjectId === subjectId && !S.state.concepts[c.id]?.learned);
  const lastPos = S.state.resume;

  const actions = [
    { id: 'zero', label: 'START FROM ZERO', cls: 'primary', emoji: '🌱', block: true },
    { id: 'continue', label: 'CONTINUE', emoji: '▶️', block: true, disabled: !lastPos },
    { id: 'guideq', label: 'PRACTICE GUIDE QUESTIONS', emoji: '📗', block: true, disabled: !hasGuides },
    { id: 'weak', label: `PRACTICE WEAK CONCEPTS${weak ? ` (${weak})` : ''}`, emoji: '🎯', block: true, disabled: !weak },
    { id: 'mixed', label: 'MIXED PRACTICE', emoji: '🔀', block: true },
    { id: 'exam', label: 'EXAM MODE', emoji: '⏱️', block: true },
  ];

  setTopbarActions(`<button class="tbtn" data-act="back">‹ Back</button>`);
  setView(`
    <div class="pagehead"><h1><span class="sub-${subjectId}">${esc(s.name)}</span></h1>
      <p>${s.questions} questions / ${s.marks} marks (indicative) · ${p.conceptsTotal} concepts · guide content ${p.contentPct}%</p></div>
    <div class="card tight">
      ${prow('Guide content', p.contentPct)}
      ${prow('Concepts mastered', pct(p.mastered, p.conceptsTotal))}
      ${prow('Questions done', p.questionPct)}
      <div class="statline" style="margin-top:8px">
        <span>Weak: <b>${p.weak}</b></span><span>Learning: <b>${p.learning}</b></span>
        <span>Mastered: <b>${p.mastered}</b></span><span>Revision due: <b>${p.dueRev}</b></span>
      </div>
    </div>
    <div class="card">${actionButtons(actions)}</div>
    <div class="section-label">Syllabus topics</div>
    ${topicItems}
  `);
  $('#topbar-actions [data-act="back"]')?.addEventListener('click', () => nav('#/study'));
  bindActions($('#view'), actions, (id) => {
    const [what, a] = id.split(':');
    if (what === 'topic') nav(`#/study/${subjectId}/${a}`);
    if (id === 'zero') {
      if (firstUnlearned) nav(`#/concept/${firstUnlearned.id}`);
      else toast('All concepts in this subject are marked learned. Practice or revise instead! 🎉');
    }
    if (id === 'continue' && lastPos) nav(lastPos.route);
    if (id === 'guideq') startQuiz({ mode: 'guide', subjectId, count: 10 }, `Guide Quiz — ${s.short}`);
    if (id === 'weak') startQuiz({ mode: 'weak', subjectId, count: Math.min(Math.max(weak, 3), 10) }, 'Weak Concept Practice');
    if (id === 'mixed') startQuiz({ mode: 'subject', subjectId, count: 10 }, `${s.short} Mixed Practice`);
    if (id === 'exam') nav('#/quiz/exam');
  });
}

/* ================= topic page ================= */
export function topicPage(subjectId, topicId) {
  const topic = TOPIC_BY_ID[topicId];
  if (!topic || topic.subjectId !== subjectId) return nav('#/study');
  const s = SUBJECT_BY_ID[subjectId];
  const tp = topicProgress(topicId);
  const concepts = [...Bank.concepts.values()].filter(c => c.topicId === topicId);
  const methods = [...Bank.methods.values()].filter(m => m.topicId === topicId);
  const guideSecs = [];
  for (const g of Object.values(S.state.guides)) for (const sec of g.sections) if (sec.topicId === topicId && sec.include) guideSecs.push({ g, sec });
  const guideQs = Bank.questionsBy(q => q.topicId === topicId && (q.source === 'GUIDE' || q.source === 'PYQ'));

  const isCA = topicId === 'current-affairs';
  setTopbarActions(`<button class="tbtn" data-act="back">‹ Back</button>`);
  setView(`
    <div class="pagehead"><h1><span class="sub-${subjectId}">${esc(topic.name)}</span></h1>
      <p>${esc(s.short)} · ${concepts.length} concepts${methods.length ? ` · ${methods.length} method models` : ''}${guideSecs.length ? ` · ${guideSecs.length} guide sections` : ''}</p></div>

    ${isCA && !guideSecs.length ? `
      <div class="card"><div class="infobanner">⚠️ Current Affairs needs a current source. This app will NOT show old static facts as “current affairs”.</div>
      <p class="small">Import a current-affairs guide (monthly/last-6-months PDF or text) via the Guides page. Questions from it will be labeled
      <span class="chip src-GUIDE">GUIDE</span> and never marked verified automatically.</p>
      <button class="btn primary" data-act="import">Import current affairs material</button></div>` : ''}

    <div class="card tight">
      ${prow('Content', pct(tp.content.done, tp.content.total))}
      ${prow('Questions', pct(tp.questions.done, tp.questions.total))}
      <div class="statline" style="margin-top:8px"><span>Mastered <b>${tp.mastered}</b>/${tp.concepts}</span>
      <span>Weak <b>${tp.weak}</b></span><span>Learning <b>${tp.learning}</b></span><span>Revision due <b>${tp.dueRev}</b></span></div>
    </div>

    <div class="card">${actionButtons([
      { id: 'learn', label: tp.content.done ? 'CONTINUE LEARNING' : 'START FROM ZERO', cls: 'primary', emoji: '🌱', block: true, disabled: !concepts.length && !guideSecs.length },
      { id: 'topicq', label: `PRACTICE TOPIC (${guideQs.length ? 'guide-first' : '10 questions'})`, emoji: '✍️', block: true },
      { id: 'weak', label: 'PRACTICE WEAK CONCEPTS', emoji: '🎯', block: true, disabled: !tp.weak },
      { id: 'mixed', label: 'MIXED PRACTICE (all models)', emoji: '🔀', block: true },
    ])}</div>

    ${methods.length ? `
      <div class="section-label">Method models — learn to RECOGNIZE which method a question needs</div>
      <button class="item" data-act="methods"><div class="ic subbg-${subjectId}">⇄</div>
        <div class="ibody"><b>Maths Method Trainer</b><small>${methods.length} models · teach → mixed questions WITHOUT labels</small></div>
        <div class="iend">open →</div></button>` : ''}

    ${concepts.length ? `<div class="section-label">Concepts (Teach From Zero)</div>` : ''}
    ${concepts.map(c => {
      const r = S.state.concepts[c.id];
      const st = r?.status || 'NEW';
      return `<button class="item" data-act="concept:${c.id}">
        <div class="ic subbg-${subjectId}" style="font-size:15px">${r?.learned ? '✓' : st === 'WEAK' ? '!' : '•'}</div>
        <div class="ibody"><b>${esc(c.title)}</b><small>${esc(c.summary)}</small></div>
        <div class="iend">${statusChip(st)}${r?.needsZero ? '<br><span class="chip red">teach zero</span>' : ''}</div>
      </button>`;
    }).join('')}

    ${guideSecs.length ? `<div class="section-label">Guide material for this topic</div>
      ${guideSecs.map(x => `<button class="item" data-act="reader:${x.g.id}:${x.sec.index}">
        <div class="ic" style="background:#1e40af">📗</div>
        <div class="ibody"><b>${esc(x.sec.title)}</b><small>${esc(x.g.title)} · ${x.sec.questionCount} guide questions${S.isSectionRead(x.sec.id) ? ' · read ✓' : ''}</small></div>
        <div class="iend">read →</div></button>`).join('')}` : ''}
  `);
  $('#topbar-actions [data-act="back"]')?.addEventListener('click', () => nav(`#/study/${subjectId}`));
  bindActions($('#view'), [
    ...$$('[data-act]').map(b => b.dataset.act),
  ], (id) => {
    const [what, a, b2] = id.split(':');
    if (what === 'concept') nav(`#/concept/${a}`);
    if (what === 'methods') nav(`#/methods/${topicId}`);
    if (what === 'reader') nav(`#/reader/${a}/${b2}`);
    if (what === 'import') nav('#/guides/import');
    if (what === 'learn') {
      const next = concepts.find(c => !S.state.concepts[c.id]?.learned) || concepts[0];
      if (next) nav(`#/concept/${next.id}`);
      else if (guideSecs.length) nav(`#/reader/${guideSecs[0].g.id}/${guideSecs[0].sec.index}`);
    }
    if (what === 'topicq') startQuiz({ mode: 'guide', topicId, subjectId, count: 10 }, `Guide Quiz — ${topic.name}`);
    if (what === 'weak') startQuiz({ mode: 'weak', subjectId, count: 10 }, 'Weak Concept Practice');
    if (what === 'mixed') startQuiz({ mode: 'subject', subjectId, topicId, count: 8 }, `${topic.name} — Mixed Models`);
  });
}

/* ================= concept page (Teach From Zero) ================= */
export function renderBlock(b) {
  switch (b.t) {
    case 'h': return `<div class="plabel">${esc(b.x)}</div>`;
    case 'p': return `<p class="tb-p">${nl2br(b.x)}</p>`;
    case 'list': return `<ul class="tb-p" style="padding-left:20px">${b.x.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
    case 'formula': return `<div class="formula-box"><small>FORMULA</small>${nl2br(b.x)}${b.note ? `<small>${esc(b.note)}</small>` : ''}</div>
      ${b.vars?.length ? `<ul class="varlist">${b.vars.map(([k, d]) => `<li><b>${esc(k)}</b> — ${esc(d)}</li>`).join('')}</ul>` : ''}`;
    case 'norule': return `<div class="rule-box"><b>No formula needed — use this rule.</b><br>${esc(b.x)}</div>`;
    case 'example': return `<div class="example-box"><b>${esc(b.x)}</b>
      ${b.steps?.length ? `<ol class="steps">${b.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
      ${b.answer ? `<div class="eq">Answer: ${esc(b.answer)}</div>` : ''}</div>`;
    case 'table': return `<table class="ttable"><thead><tr>${b.head.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead>
      <tbody>${b.rows.map(r => `<tr>${r.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    case 'steps': return `<ol class="steps">${b.x.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
    case 'trap': return `<div class="trap-box"><b>⚠️ Common exam trap</b><br>${esc(b.x)}</div>`;
    case 'memory': return `<div class="memory-box"><b>🧠 Memory method — ${esc(b.tech)}</b><br>${esc(b.x)}</div>`;
    case 'recall': return `<div class="recall-box"><b>⏱️ 5-second exam recall</b><br>${esc(b.x)}</div>`;
    case 'note': return `<div class="note-box">${esc(b.x)}</div>`;
    default: return '';
  }
}

export function conceptPage(conceptId) {
  const c = Bank.concepts.get(conceptId);
  if (!c) return nav('#/study');
  const topic = TOPIC_BY_ID[c.topicId];
  const r = S.state.concepts[conceptId];
  const siblings = [...Bank.concepts.values()].filter(x => x.topicId === c.topicId);
  const idx = siblings.findIndex(x => x.id === conceptId);
  S.setResume(`${topic.name} → ${c.title}`, `#/concept/${conceptId}`);

  const staticQs = (c.practice?.static || []).map(id => Bank.questions.get(id)).filter(Boolean);
  const gens = (c.practice?.generators || []).map(id => Bank.generators.get(id)).filter(Boolean);

  setTopbarActions(`<button class="tbtn" data-act="back">‹ Back</button>`);
  setView(`
    <div class="pagehead">
      <h1>${esc(c.title)}</h1>
      <p><span class="sub-${c.subjectId}">${esc(topic.name)}</span> · concept ${idx + 1} of ${siblings.length}
      ${r ? '· ' + statusChip(r.status) : ''} ${r?.needsZero ? '<span class="chip red">Teach-from-zero recommended — you missed this 3 times</span>' : ''}</p>
    </div>
    <div class="card">${sourceChip(c.source)} <span class="chip gray">${esc(c.sourceRef)}</span></div>
    <div class="card" id="teach">
      ${c.blocks.map(renderBlock).join('')}
    </div>

    <div class="card" id="guided">
      <div class="plabel">Guided question — try it now</div>
      <p class="qtext" style="margin-top:4px">${nl2br(c.guided.text)}</p>
      <div id="gopts">${c.guided.options.map((o, i) => `
        <button class="opt" data-gi="${i}"><span class="ol">${'abcd'[i]}</span><span>${esc(o)}</span></button>`).join('')}</div>
      <div class="row" style="margin-top:8px">
        <button class="btn primary" id="gcheck" disabled>Check answer</button>
      </div>
      <div id="gfeedback"></div>
    </div>

    <div class="card">
      <div class="plabel">Practice</div>
      <p class="small mb0">${staticQs.length} curated question${staticQs.length === 1 ? '' : 's'}${gens.length ? ' + unlimited fresh variants' : ''} for this concept.</p>
      <div class="row" style="margin-top:10px">
        <button class="btn primary" data-act="practice">Practice this concept (3 questions)</button>
        <button class="btn" data-act="learned">${r?.learned ? 'Learned ✓' : 'Mark as learned'}</button>
      </div>
    </div>

    <div class="row" style="justify-content:space-between;margin:6px 2px 20px">
      ${idx > 0 ? `<button class="btn ghost" data-act="prev">‹ ${esc(siblings[idx - 1].title.slice(0, 24))}</button>` : '<span></span>'}
      ${idx < siblings.length - 1 ? `<button class="btn ghost" data-act="next">${esc(siblings[idx + 1].title.slice(0, 24))} ›</button>` : ''}
    </div>
  `);

  $('#topbar-actions [data-act="back"]')?.addEventListener('click', () => nav(`#/study/${c.subjectId}/${c.topicId}`));

  let chosen = -1;
  const optBtns = $$('#gopts .opt');
  optBtns.forEach(b => b.addEventListener('click', () => {
    chosen = +b.dataset.gi;
    optBtns.forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
    $('#gcheck').disabled = false;
  }));
  $('#gcheck').addEventListener('click', () => {
    const okAns = chosen === c.guided.answer;
    optBtns.forEach((b, i) => {
      b.disabled = true;
      if (i === c.guided.answer) b.classList.add('correct');
      if (i === chosen && !okAns) b.classList.add('wrong');
    });
    $('#gcheck').style.display = 'none';
    $('#gfeedback').innerHTML = `
      <div class="panel ${okAns ? 'good' : 'bad'}">
        <div class="panel-h">${okAns ? '✅ Correct!' : '❌ Not right — see the steps'}</div>
        <div class="panel-b">
          <ol class="steps">${c.guided.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
          ${okAns ? '' : '<p class="small">Read the concept above once more, then try the practice questions — they will be DIFFERENT questions on the same idea.</p>'}
        </div>
      </div>
      ${!S.state.concepts[conceptId]?.learned ? `<button class="btn ok block" id="glearn" style="margin-top:10px">I understood — mark learned & practice</button>` : ''}`;
    $('#glearn')?.addEventListener('click', () => {
      S.markConceptLearned(conceptId);
      toast('Concept marked learned ✓ Now practice it!');
      startQuiz({ mode: 'practice', conceptId, count: 3 }, c.title);
    });
  });

  $$('[data-act]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'practice') startQuiz({ mode: 'practice', conceptId, count: 3 }, c.title);
    if (a === 'learned') {
      S.markConceptLearned(conceptId);
      toast('Marked as learned ✓');
      conceptPage(conceptId);
    }
    if (a === 'prev') nav(`#/concept/${siblings[idx - 1].id}`);
    if (a === 'next') nav(`#/concept/${siblings[idx + 1].id}`);
  }));
}

/* ================= method trainer ================= */
export function methodTrainerPage(topicId) {
  const topic = TOPIC_BY_ID[topicId];
  const methods = [...Bank.methods.values()].filter(m => m.topicId === topicId);
  if (!topic || !methods.length) return nav('#/study');
  setTopbarActions(`<button class="tbtn" data-act="back">‹ Back</button>`);
  setView(`
    <div class="pagehead"><h1><span class="sub-${topic.subjectId}">Method Trainer — ${esc(topic.name)}</span></h1>
      <p>Step 1: learn the models. Step 2: mixed questions WITHOUT model labels — YOU recognize which method is needed.</p></div>
    <div class="card">${actionButtons([
      { id: 'mixed', label: 'START MODEL-RECOGNITION TEST (no labels)', cls: 'primary', emoji: '🕵️', block: true },
    ])}</div>
    ${methods.map((m, i) => `
      <div class="card" id="m-${m.id}">
        <div class="row between"><h3 style="margin:0">${esc(m.name)}</h3>${sourceChip(m.source)}</div>
        <p>${esc(m.idea)}</p>
        ${m.formula ? `<div class="formula-box"><small>FORMULA</small>${nl2br(m.formula)}</div>` : ''}
        <div class="plabel">How to RECOGNIZE this model</div>
        <p class="tb-p">${esc(m.recognize)}</p>
        <div class="example-box"><b>${esc(m.example.text)}</b>
          <ol class="steps">${m.example.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
          <div class="eq">Answer: ${esc(m.example.answer)}</div></div>
        <div class="row" style="margin-top:10px">
          <button class="btn small primary" data-drill="${m.id}">Practice this model (3 questions)</button>
        </div>
      </div>`).join('')}
    <p class="small center" style="margin-bottom:16px">Practice questions are drawn guide-first; fresh variants are always labeled AI-GENERATED PRACTICE.</p>
  `);
  $('#topbar-actions [data-act="back"]')?.addEventListener('click', () => nav(`#/study/${topic.subjectId}/${topicId}`));
  $('[data-act="mixed"]')?.addEventListener('click', () =>
    startQuiz({ mode: 'model-mixed', topicId, subjectId: topic.subjectId, count: 6 }, `${topic.name} — Model Recognition`));
  $$('[data-drill]').forEach(b => b.addEventListener('click', () => {
    const m = Bank.methods.get(b.dataset.drill);
    startQuiz({ mode: 'practice', methodId: m.id, topicId, subjectId: topic.subjectId, count: 3 }, `${m.name} — model practice`);
  }));
}
