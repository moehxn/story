/* ============================================================
   GUIDES — import pipeline (read → detect → map → review → confirm),
   library, reader, question completion, verification flags.
   Spec §28 + §32: imported content is NOT automatically verified.
   ============================================================ */
import { S, Bank, guideProgress } from '../store.js';
import { SUBJECTS, topicsOf, TOPIC_BY_ID, GUIDE_EXTRA_BUCKETS } from '../syllabus.js';
import { parseGuide, finalizeGuide, readFileAsGuide, removeGuide, setGuideQuestionAnswer, markGuideVerified, exportGuideJSON } from '../guides/importer.js';
import { $, $$, esc, nl2br, setView, setTopbarActions, nav, sourceChip, bar, pct, toast, modal, confirmModal, emptyState, fmtDate } from './core.js';

const DEMO_GUIDE = `CHAPTER 1: Percentage — Basic Models
Percentage means "per hundred". x% of N means x/100 times N.
To increase a value by r percent, multiply by (100 + r)/100.
Q1. A price is Rs.500 and increases by 20%. Find the new price.
(a) Rs.520 (b) Rs.600 (c) Rs.625 (d) Rs.700
Ans. (b)
Sol. New price = 500 x 120/100 = Rs.600.
Q2. A salary is Rs.8,000 and increases by 15%. Find the new salary.
(a) Rs.8,150 (b) Rs.9,000 (c) Rs.9,200 (d) Rs.8,800
Ans. (c)
Sol. New salary = 8000 x 115/100 = Rs.9,200.
Q3. After a 20% increase, the price of an item became Rs.600. What was the original price?
(a) Rs.480 (b) Rs.500 (c) Rs.520 (d) Rs.580
Ans. (b)
Sol. Original = 600 x 100/120 = Rs.500.
CHAPTER 2: Light — Reflection and Refraction
Light reflects from mirrors. The angle of incidence equals the angle of reflection.
A plane mirror forms a virtual, laterally inverted image.
Q4. The image formed by a plane mirror is:
(a) real and inverted (b) virtual and laterally inverted (c) real and erect (d) virtual and inverted
Ans. (b)
Q5. A pencil partly in water looks bent due to:
(a) reflection (b) refraction (c) dispersion (d) diffraction
Ans. (b)
CHAPTER 3: Computer Basics
A computer system has hardware and software. The CPU processes instructions.
RAM is temporary memory; the hard disk stores data permanently.
Q6. The part known as the brain of the computer is the:
(a) RAM (b) CPU (c) Monitor (d) Keyboard
Ans. (b)`;

let pendingImport = null; // parsed guide awaiting review

/* ================= library ================= */
export function guidesPage() {
  const guides = Object.values(S.state.guides);
  setTopbarActions('');
  setView(`
    <div class="pagehead"><h1>Guides</h1>
      <p>Your uploaded guides are the PRIMARY study material. They are mapped to the official syllabus automatically — and you approve the mapping.</p></div>
    <div class="warnbanner">⚠️ Imported guide content is not automatically verified. Exam references are shown only when the guide itself states them.</div>
    <div class="card">
      <div class="row">
        <button class="btn primary" data-act="import">＋ Import guide</button>
        <button class="btn" data-act="demo">Load demo guide (test the flow)</button>
      </div>
      <p class="small mb0" style="margin-top:10px">Accepted: PDF (needs internet once), TXT, MD, HTML, exported guide JSON, or pasted text. The demo guide is sample content to try the pipeline — it is not from any real book.</p>
    </div>
    ${guides.length ? guides.map(g => {
      const gp = guideProgress(g.id);
      return `<button class="item" data-act="open:${g.id}">
        <div class="ic" style="background:#1e40af">📗</div>
        <div class="ibody"><b>${esc(g.title)}</b>
          <small>${g.sections.filter(s => s.include).length} sections · ${gp.qTotal} questions · imported ${fmtDate(g.importedAt.slice(0, 10))}${g.verified ? ' · ✅ you marked verified' : ' · unverified'}</small>
          <div style="margin-top:5px">${bar(pct(gp.inDone + gp.exDone, Math.max(1, gp.inTotal + gp.exTotal)))}</div></div>
        <div class="iend">${gp.qNoAns ? `<span class="chip red">${gp.qNoAns} need answers</span>` : ''}</div>
      </button>`;
    }).join('') : emptyState('📖', 'No guides imported yet', 'Import your Maths, Reasoning, Science and GK guides. They take priority over all other question sources.')}
  `);
  $$('[data-act]').forEach(b => b.addEventListener('click', () => {
    const [what, a] = b.dataset.act.split(':');
    if (what === 'import') nav('#/guides/import');
    if (what === 'demo') doImport(DEMO_GUIDE, { fileName: 'demo-guide.txt', title: 'Demo Guide (test content)' });
    if (what === 'open') nav(`#/guide/${a}`);
  }));
}

/* ================= import ================= */
export function importPage() {
  setTopbarActions(`<button class="tbtn" data-back>‹ Back</button>`);
  setView(`
    <div class="pagehead"><h1>Import guide</h1><p>Step 1 — read the guide · Step 2 — review the automatic syllabus mapping · Step 3 — add to your library.</p></div>
    <div class="warnbanner">⚠️ Imported guide content is not automatically verified. Questionable content can be flagged for review later.</div>
    <div class="card">
      <div class="field">
        <label>Upload file (PDF / TXT / MD / HTML / guide JSON)</label>
        <input type="file" id="gfile" accept=".pdf,.txt,.md,.markdown,.html,.htm,.json,text/plain,application/pdf">
        <p class="small" style="margin-top:6px">PDF reading loads a small library from the internet once. If you are offline, paste the text instead.</p>
      </div>
      <div class="field">
        <label>…or paste guide text</label>
        <textarea id="gpaste" placeholder="Paste chapters, notes, questions with options (a)(b)(c)(d), answers like “Ans. (b)” and solutions like “Sol. …”"></textarea>
      </div>
      <button class="btn primary" id="ggo">Read and map this guide</button>
    </div>
    <div id="gstatus"></div>
  `);
  $('#topbar-actions [data-back]')?.addEventListener('click', () => nav('#/guides'));

  $('#ggo').addEventListener('click', () => {
    const file = $('#gfile').files[0];
    const text = $('#gpaste').value.trim();
    if (file) {
      $('#gstatus').innerHTML = `<div class="infobanner">Reading “${esc(file.name)}”…</div>`;
      readFileAsGuide(file)
        .then((res) => {
          if (res.prebuilt) { ingestPrebuilt(res.prebuilt); return; }
          doImport(res.text, { fileName: file.name, title: file.name.replace(/\.[^.]+$/, '') });
        })
        .catch(err => { $('#gstatus').innerHTML = `<div class="dangerbanner">${esc(err.message)}</div>`; });
    } else if (text) {
      doImport(text, { fileName: null, title: 'Pasted guide' });
    } else {
      toast('Choose a file or paste some text first.');
    }
  });
}

function ingestPrebuilt(data) {
  // previously exported guide JSON
  const guide = { ...data, id: 'g' + Date.now().toString(36) };
  guide.questions = (guide.questions || []).map(q => ({ ...q, guideId: guide.id }));
  S.state.guides[guide.id] = guide;
  Bank.addGuideQuestions(guide.questions);
  S.save();
  toast('Guide imported from JSON ✓');
  nav(`#/guide/${guide.id}`);
}

function doImport(text, meta) {
  $('#gstatus').innerHTML = `<div class="infobanner">Reading and detecting chapters, topics, questions and source references…</div>`;
  setTimeout(() => {
    try {
      const parsed = parseGuide(text, meta);
      const stats = parsed.stats;
      if (!stats.totalQ && !parsed.sections.some(s => s.text)) {
        $('#gstatus').innerHTML = `<div class="dangerbanner">Could not find any readable content. If this is a scanned/image PDF, the text cannot be extracted — try a text-based file or paste the text.</div>`;
        return;
      }
      pendingImport = parsed;
      renderReview();
    } catch (err) {
      $('#gstatus').innerHTML = `<div class="dangerbanner">Import failed: ${esc(err.message)}</div>`;
    }
  }, 30);
}

/* ---- step 2: review mapping ---- */
function renderReview() {
  const p = pendingImport;
  if (!p) return nav('#/guides/import');
  const topicOptions = (sel) => SUBJECTS.map(s =>
    `<optgroup label="${esc(s.name)}">${topicsOf(s.id).map(t =>
      `<option value="t:${t.id}" ${sel === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>`).join('');
  const extraOptions = (sel) => GUIDE_EXTRA_BUCKETS.map(b =>
    `<option value="x:${b.id}" ${sel === b.id ? 'selected' : ''}>GUIDE EXTRA — ${esc(b.name)}</option>`).join('');

  setView(`
    <div class="pagehead"><h1>Review mapping</h1>
      <p>Step 2 — check where each section belongs. “IN SYLLABUS” sections feed the official syllabus progress; GUIDE EXTRA stays separate.</p></div>
    <div class="card tight">
      <div class="statgrid">
        <div class="stat"><b>${p.stats.sectionCount}</b><small>SECTIONS</small></div>
        <div class="stat"><b>${p.stats.totalQ}</b><small>QUESTIONS</small></div>
        <div class="stat"><b>${p.stats.withAns}</b><small>WITH ANSWERS</small></div>
        <div class="stat"><b>${p.stats.examRefs}</b><small>EXAM-REF CLAIMS</small></div>
      </div>
      <p class="small" style="margin-top:8px">Guide title: <b>${esc(p.title)}</b>${p.fileName ? ' · file: ' + esc(p.fileName) : ''}</p>
      <p class="small mb0">Questions without a detected answer go to a “needs answers” list — you set the correct option before they enter quizzes. Nothing is guessed.</p>
    </div>
    ${p.sections.map((sec, i) => {
      const cur = sec.guessTopicId ? 't:' + sec.guessTopicId : (sec.guessExtra ? 'x:' + sec.guessExtra : 'x:x-misc');
      const kind = sec.guessTopicId ? '<span class="chip blue">IN SYLLABUS</span>' : sec.guessExtra !== 'x-misc' ? '<span class="chip amber">GUIDE EXTRA</span>' : '<span class="chip red">UNMAPPED</span>';
      return `<div class="card tight">
        <div class="row between">
          <div><b>${esc(sec.title)}</b><br><span class="small">chapter: ${esc(sec.chapter)}</span></div>
          <div>${kind}</div>
        </div>
        <div class="row" style="margin-top:8px">
          <select data-map="${i}" style="flex:1;padding:8px;border:1.5px solid var(--line);border-radius:9px;font-size:13px">
            ${topicOptions(sec.guessTopicId)}
            <optgroup label="Not in official syllabus">${extraOptions(sec.guessExtra)}</optgroup>
            <option value="skip">⏭️ Skip — do not import this section</option>
          </select>
          <button class="btn small ${sec.include !== false ? 'ok' : ''}" data-inc="${i}">${sec.include !== false ? 'Include ✓' : 'Excluded'}</button>
        </div>
        <div class="small" style="margin-top:6px">
          ${sec.questions.length} question${sec.questions.length === 1 ? '' : 's'} detected
          (${sec.questions.filter(q => q.answerAvailable).length} with answers)
          ${sec.questions.some(q => q.examRef) ? ' · <span class="chip src-PYQ">exam refs: ' + sec.questions.filter(q => q.examRef).map(q => esc(q.examRef.claim)).join(', ') + '</span>' : ''}
          ${sec.text ? ' · ' + sec.text.slice(0, 90).replace(/\n/g, ' ') + '…' : ''}
        </div>
      </div>`;
    }).join('')}
    <div class="card">
      <div class="row">
        <button class="btn primary" id="confirmImport">✓ Confirm and add to library</button>
        <button class="btn" id="cancelImport">Cancel</button>
      </div>
    </div>
  `);

  const mappings = {};
  const includes = {};
  p.sections.forEach((sec, i) => {
    mappings[i] = sec.guessTopicId ? { topicId: sec.guessTopicId } : { extra: sec.guessExtra || 'x-misc' };
    includes[i] = sec.include !== false;
  });
  $$('[data-map]').forEach(sel => sel.addEventListener('change', () => {
    const i = sel.dataset.map;
    const v = sel.value;
    if (v === 'skip') { includes[i] = false; }
    else if (v.startsWith('t:')) { mappings[i] = { topicId: v.slice(2) }; includes[i] = true; }
    else { mappings[i] = { extra: v.slice(2) }; includes[i] = true; }
    const btn = $(`[data-inc="${i}"]`);
    btn.classList.toggle('ok', includes[i]);
    btn.textContent = includes[i] ? 'Include ✓' : 'Excluded';
  }));
  $$('[data-inc]').forEach(btn => btn.addEventListener('click', () => {
    const i = btn.dataset.inc;
    includes[i] = !includes[i];
    btn.classList.toggle('ok', includes[i]);
    btn.textContent = includes[i] ? 'Include ✓' : 'Excluded';
  }));
  $('#cancelImport').addEventListener('click', () => { pendingImport = null; nav('#/guides'); });
  $('#confirmImport').addEventListener('click', () => {
    const full = {};
    Object.keys(mappings).forEach(i => full[i] = { ...mappings[i], include: includes[i] });
    const guide = finalizeGuide(pendingImport, full);
    pendingImport = null;
    toast(`Guide imported ✓ ${guide.questions.length} questions added (GUIDE source)`);
    nav(`#/guide/${guide.id}`);
  });
}

/* ================= guide detail ================= */
export function guidePage(guideId) {
  const g = S.state.guides[guideId];
  if (!g) return nav('#/guides');
  const gp = guideProgress(guideId);
  const needsAns = g.questions.filter(q => !q.answerAvailable);
  setTopbarActions(`<button class="tbtn" data-back>‹ Back</button>`);

  setView(`
    <div class="pagehead"><h1>📗 ${esc(g.title)}</h1>
      <p>${g.sections.filter(s => s.include).length} sections · ${gp.qTotal} questions · imported ${fmtDate(g.importedAt.slice(0, 10))}</p></div>

    ${g.verified
      ? '<div class="infobanner">✅ You marked this guide’s content as verified from an official source.</div>'
      : '<div class="warnbanner">⚠️ Verification status: needs verification — guide content is not automatically fact-checked.</div>'}

    <div class="card tight">
      ${bar(pct(gp.inDone, Math.max(1, gp.inTotal)))}
      <div class="statline" style="margin-top:6px">
        <span>In-syllabus read: <b>${gp.inDone}/${gp.inTotal}</b></span>
        <span>Guide extra read: <b>${gp.exDone}/${gp.exTotal}</b></span>
        <span>Questions practised: <b>${gp.qDone}/${gp.qTotal}</b></span>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn small primary" data-act="quizall">Practice guide questions</button>
        <button class="btn small" data-act="readnext">${gp.inDone < gp.inTotal ? 'Continue reading' : 'Read guide extra'}</button>
      </div>
    </div>

    ${needsAns.length ? `
    <div class="section-label" style="color:var(--bad)">Needs answers (${needsAns.length}) — these questions stay OUT of quizzes until you set the correct option</div>
    <div class="card tight">
      ${needsAns.map((q, i) => `
        <div style="border-bottom:1px dashed var(--line);padding:10px 0">
          <p style="font-weight:600;font-size:13.5px">${nl2br(q.text)}</p>
          ${q.options.map((o, oi) => `
            <button class="opt" data-set="${q.id}:${oi}" style="padding:8px 10px;margin-bottom:6px;font-size:13px">
              <span class="ol">${'abcd'[oi] || '?'}</span><span>${esc(o)}</span></button>`).join('')}
          ${q.answerText ? `<p class="small">Guide answer line: “${esc(q.answerText)}”</p>` : ''}
        </div>`).join('')}
    </div>` : ''}

    <div class="section-label">Sections & syllabus mapping</div>
    ${g.sections.filter(s => s.include).map(sec => `
      <button class="item" data-read="${sec.index}">
        <div class="ic" style="background:${sec.inSyllabus ? 'var(--science)' : '#9a3412'}">${sec.inSyllabus ? '✓' : '＋'}</div>
        <div class="ibody"><b>${esc(sec.title)}</b>
          <small>${sec.inSyllabus
            ? `IN SYLLABUS → ${esc(TOPIC_BY_ID[sec.topicId]?.name || sec.topicId)}`
            : `GUIDE EXTRA — ${esc((GUIDE_EXTRA_BUCKETS.find(b => b.id === sec.extraBucket) || {}).name || 'Miscellaneous')}`}
            · ${sec.questionCount} questions${S.isSectionRead(sec.id) ? ' · read ✓' : ''}</small></div>
        <div class="iend">open →</div>
      </button>`).join('')}

    <div class="card">
      <div class="plabel" style="margin-top:0">Manage</div>
      <div class="row">
        <button class="btn small ${g.verified ? '' : 'ok'}" data-act="verify">${g.verified ? 'Unmark verified' : 'Mark content verified (I checked the source)'}</button>
        <button class="btn small" data-act="export">Export guide JSON</button>
        <button class="btn small danger" data-act="delete">Delete guide</button>
      </div>
      <p class="small mb0" style="margin-top:8px">Marking verified is YOUR decision — the app never marks guide content verified by itself. Exam references shown in questions are guide-claimed only.</p>
    </div>
  `);

  $('#topbar-actions [data-back]')?.addEventListener('click', () => nav('#/guides'));
  $$('[data-read]').forEach(b => b.addEventListener('click', () => nav(`#/reader/${guideId}/${b.dataset.read}`)));
  $$('[data-set]').forEach(b => b.addEventListener('click', () => {
    const [qid, oi] = b.dataset.set.split(':');
    setGuideQuestionAnswer(guideId, qid, +oi);
    toast('Answer set — the question is now available in quizzes ✓');
    guidePage(guideId);
  }));
  $$('[data-act]').forEach(b => b.addEventListener('click', async () => {
    const a = b.dataset.act;
    if (a === 'quizall') {
      const { startQuiz } = await import('./quiz.js');
      startQuiz({ mode: 'guide', guideId, count: 10 }, `Guide Quiz — ${g.title}`);
    }
    if (a === 'readnext') {
      const next = g.sections.find(s => s.include && !S.isSectionRead(s.id)) || g.sections.find(s => s.include);
      if (next) nav(`#/reader/${guideId}/${next.index}`);
    }
    if (a === 'verify') { markGuideVerified(guideId, !g.verified); toast(g.verified ? 'Marked unverified' : 'Marked verified ✓'); guidePage(guideId); }
    if (a === 'export') {
      const blob = new Blob([exportGuideJSON(guideId)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `${g.title.replace(/[^a-z0-9]+/gi, '-')}.json`; link.click();
      URL.revokeObjectURL(url);
    }
    if (a === 'delete') {
      confirmModal('Delete this guide?', 'The guide and its questions are removed from your library. Your attempt history stays.', () => {
        removeGuide(guideId); toast('Guide deleted'); nav('#/guides');
      }, 'Delete guide');
    }
  }));
}

/* ================= reader ================= */
export function readerPage(guideId, sectionIdx) {
  const g = S.state.guides[guideId];
  if (!g) return nav('#/guides');
  const sec = g.sections.find(s => s.index === +sectionIdx);
  if (!sec) return nav(`#/guide/${guideId}`);
  const qs = g.questions.filter(q => q.sectionId === sec.id && q.answerAvailable);
  const read = S.isSectionRead(sec.id);
  S.setResume(`Guide: ${g.title} → ${sec.title}`, `#/reader/${guideId}/${sectionIdx}`);

  setTopbarActions(`<button class="tbtn" data-back>‹ Back</button>`);
  setView(`
    <div class="pagehead"><h1>${esc(sec.title)}</h1>
      <p>${esc(g.title)} · ${sec.inSyllabus
        ? 'IN SYLLABUS — ' + esc(TOPIC_BY_ID[sec.topicId]?.name || '')
        : 'GUIDE EXTRA (outside the official syllabus)'}</p></div>
    ${sec.inSyllabus ? '' : '<div class="warnbanner">This section is outside the official RRB syllabus. Useful, but focus on the syllabus first.</div>'}

    <div class="card">
      <div style="white-space:pre-wrap;font-size:14.5px;line-height:1.7">${esc(sec.text || '(No extra text in this section.)')}</div>
      ${sec.formulas?.length ? `<div class="plabel">Key lines from the guide</div>
        ${sec.formulas.map(f => `<div class="formula-box">${esc(f)}</div>`).join('')}` : ''}
    </div>

    <div class="card">
      <button class="btn ${read ? '' : 'primary'} block" id="markread">${read ? 'Read ✓ (tap to unmark)' : 'I read this — mark as read'}</button>
      <p class="small center" style="margin:8px 0 0">Marking read updates your real guide-progress numbers.</p>
    </div>

    ${qs.length ? `
    <div class="card">
      <div class="plabel" style="margin-top:0">Guide questions in this section (${qs.length})</div>
      ${qs.map(q => `<div style="border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:8px">
        <p style="font-weight:600;font-size:14px">${nl2br(q.text)}</p>
        <p class="small mb0">${sourceChip(q.source)} ${q.guideClaim ? '<span class="chip gray">claimed: ' + esc(q.guideClaim) + '</span>' : ''}
        ${S.state.qstats[q.id] ? '<span class="chip green">attempted</span>' : ''}</p>
      </div>`).join('')}
      <button class="btn primary block" id="practiceSec">Practice these ${qs.length} questions</button>
    </div>` : ''}
  `);
  $('#topbar-actions [data-back]')?.addEventListener('click', () => nav(`#/guide/${guideId}`));
  $('#markread').addEventListener('click', () => {
    if (S.isSectionRead(sec.id)) { delete S.state.read[sec.id]; S.save(); }
    else { S.markSectionRead(sec.id); toast('Marked as read ✓'); }
    readerPage(guideId, sectionIdx);
  });
  $('#practiceSec')?.addEventListener('click', async () => {
    const { startQuiz } = await import('./quiz.js');
    startQuiz({ mode: 'guide', guideId, topicId: sec.topicId || undefined, includeExtra: !sec.inSyllabus, count: Math.max(qs.length, 1) }, sec.title);
  });
}
