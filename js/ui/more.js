/* ============================================================
   MORE — settings, exam config, source-label legend, data tools,
   content stats, honest about/philosophy.
   ============================================================ */
import { S, Bank, weakConcepts } from '../store.js';
import { SUBJECTS, SOURCES, SOURCE_ORDER, EXAM, topicsOf } from '../syllabus.js';
import { STARTER_STATS } from '../content/index.js';
import { $, $$, esc, setView, setTopbarActions, nav, toast, confirmModal } from './core.js';

export function morePage() {
  const st = S.state.settings;
  setTopbarActions('');
  setView(`
    <div class="pagehead"><h1>More</h1><p>Settings, data, and how this trainer labels everything.</p></div>

    <div class="card">
      <div class="plabel" style="margin-top:0">Settings</div>
      <div class="field"><label>Your name (optional)</label>
        <input type="text" id="sname" value="${esc(st.name)}" placeholder="e.g. Aspirant"></div>
      <div class="field"><label>Exam date (optional — used for countdown & plan)</label>
        <input type="date" id="sexam" value="${st.examDate || ''}"></div>
      <div class="field"><label>Exam-mode length (questions)</label>
        <input type="number" id="slen" min="10" max="100" value="${st.examQuestions}"></div>
      <div class="field"><label>Exam-mode timer (minutes)</label>
        <input type="number" id="smin" min="10" max="180" value="${st.examMinutes}"></div>
      <div class="switchrow"><span>Negative marking (−1/3) in exam mode</span>
        <input type="checkbox" id="sneg" ${st.negative ? 'checked' : ''}></div>
      <button class="btn primary" id="ssave" style="margin-top:10px">Save settings</button>
    </div>

    <div class="card">
      <div class="plabel" style="margin-top:0">Source labels — what they really mean</div>
      ${SOURCE_ORDER.map(k => `<div style="padding:7px 0;border-bottom:1px dashed var(--line)">
        <span class="chip ${SOURCES[k].cls}">${SOURCES[k].label}</span>
        <div class="small" style="margin-top:4px">${esc(SOURCES[k].desc)}</div></div>`).join('')}
      <p class="small mb0" style="margin-top:10px">This app NEVER invents exam years, shifts or paper names. If a question’s origin is unknown, it is labeled uncertain or AI-generated — never PYQ.</p>
    </div>

    <div class="card">
      <div class="plabel" style="margin-top:0">Content in this app right now</div>
      <div class="statgrid">
        <div class="stat"><b>${Bank.concepts.size}</b><small>CONCEPTS</small></div>
        <div class="stat"><b>${Bank.methods.size}</b><small>METHOD MODELS</small></div>
        <div class="stat"><b>${Bank.questions.size}</b><small>QUESTIONS</small></div>
        <div class="stat"><b>${Bank.generators.size}</b><small>VARIANT GENERATORS</small></div>
      </div>
      <p class="small" style="margin-top:8px">Starter Pack content is labeled <b>EXPECTED PRACTICE</b> (built from the official syllabus pattern — not from any guide, not from any exam paper). Fresh variants are labeled <b>AI-GENERATED PRACTICE</b>. Guide-imported questions are labeled <b>GUIDE</b>, or <b>VERIFIED RRB/PYQ</b> only when your guide itself states the exam reference.</p>
    </div>

    <div class="card">
      <div class="plabel" style="margin-top:0">Data</div>
      <div class="row">
        <button class="btn" data-act="export">Export backup</button>
        <button class="btn" data-act="import">Import backup</button>
        <button class="btn danger" data-act="reset">Reset everything</button>
      </div>
      <input type="file" id="importfile" accept=".json" class="hidden">
      <p class="small mb0" style="margin-top:8px">Progress is stored locally in this browser. The storage layer is a small adapter, so it can be moved to a server (e.g. Supabase) later without touching the app logic.</p>
    </div>

    <div class="card">
      <div class="plabel" style="margin-top:0">How this trainer thinks</div>
      <ul style="padding-left:18px;font-size:13.5px;line-height:1.8;margin:0">
        <li><b>Maths:</b> concept → formula/rule → method recognition → calculation → practice → mixed practice.</li>
        <li><b>Reasoning:</b> pattern → recognize pattern → method → different patterns → mixed practice.</li>
        <li><b>Science:</b> concept → simple explanation → real-life example → fact/rule → application → questions.</li>
        <li><b>GA:</b> fact → context → why it matters → association → recall → spaced revision.</li>
        <li><b>Weak Maths model?</b> Same model, DIFFERENT question — repetition for learning, not for time-wasting.</li>
        <li><b>One correct answer never masters a concept.</b> Three in a row with a mixed/exam question does.</li>
      </ul>
    </div>

    <div class="card">
      <div class="plabel" style="margin-top:0">Official exam structure (reference)</div>
      <table class="ttable">
        <thead><tr><th>Subject</th><th>Questions</th><th>Marks</th></tr></thead>
        <tbody>
          ${SUBJECTS.map(s => `<tr><td>${esc(s.name)}</td><td>${s.questions}</td><td>${s.marks}</td></tr>`).join('')}
          <tr><td><b>Total</b></td><td><b>100</b></td><td><b>100</b></td></tr>
        </tbody>
      </table>
      <p class="small mb0">${esc(EXAM.note)} Exam-mode defaults: ${EXAM.minutes} minutes, 1/3 negative marking — all adjustable above.</p>
    </div>

    <p class="small center" style="margin:6px 2px 20px">RRB Technician Grade III Smart Study & Quiz Trainer · works fully offline · your data stays in your browser.</p>
  `);

  $('#ssave').addEventListener('click', () => {
    st.name = $('#sname').value.trim();
    st.examDate = $('#sexam').value || null;
    st.examQuestions = Math.max(10, Math.min(100, +$('#slen').value || 100));
    st.examMinutes = Math.max(10, Math.min(180, +$('#smin').value || 90));
    st.negative = $('#sneg').checked;
    S.save();
    toast('Settings saved ✓');
  });

  $$('[data-act]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'export') {
      const blob = new Blob([S.exportJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `rrb-t3-progress-${S.today()}.json`; link.click();
      URL.revokeObjectURL(url);
      toast('Backup downloaded ✓');
    }
    if (a === 'import') $('#importfile').click();
    if (a === 'reset') {
      confirmModal('Reset EVERYTHING?', 'All progress, weak concepts, plans and imported guides will be deleted from this browser. This cannot be undone.', () => {
        S.reset(); location.hash = '#/home'; location.reload();
      }, 'Yes, reset all');
    }
  }));
  $('#importfile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try { await S.importJSON(await file.text()); toast('Backup imported ✓'); location.reload(); }
    catch (err) { toast('Import failed: ' + err.message); }
  });
}
