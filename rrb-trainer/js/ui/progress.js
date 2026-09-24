/* ============================================================
   PROGRESS — real numbers only: per-subject and per-topic breakdown,
   weak concept bank, attempt history, day activity, data export/import.
   ============================================================ */
import { S, Bank, subjectProgress, topicProgress, weakConcepts, revisionDue } from '../store.js';
import { SUBJECTS, TOPICS, TOPIC_BY_ID } from '../syllabus.js';
import { $, $$, esc, setView, setTopbarActions, nav, bar, prow, pct, statusChip, fmtDate, toast, modal, confirmModal } from './core.js';

export function progressPage() {
  const per = SUBJECTS.map(s => subjectProgress(s.id));
  const attempts = S.state.attempts;
  const totalQ = attempts.length;
  const totalC = attempts.filter(a => a.c === 1).length;
  const weak = weakConcepts();
  const days = Object.entries(S.state.days).filter(([d, v]) => v.q > 0).sort().slice(-14);

  setTopbarActions('');
  setView(`
    <div class="pagehead"><h1>Progress</h1><p>Everything below is computed from your actual answers and reading. No fake numbers.</p></div>

    <div class="card center">
      <div class="statgrid">
        <div class="stat"><b>${totalQ}</b><small>QUESTIONS ANSWERED</small></div>
        <div class="stat"><b>${totalQ ? Math.round((totalC / totalQ) * 100) : 0}%</b><small>ACCURACY</small></div>
        <div class="stat"><b>${weak.length}</b><small>WEAK CONCEPTS</small></div>
        <div class="stat"><b>${revisionDue().filter(x => x.overdue).length}</b><small>REVISION DUE</small></div>
        <div class="stat"><b>${Object.keys(S.state.days).filter(d => S.state.days[d].q > 0).length}</b><small>ACTIVE DAYS</small></div>
        <div class="stat"><b>${Object.values(S.state.days).reduce((a, d) => a + d.min, 0)}</b><small>MINUTES STUDIED</small></div>
      </div>
    </div>

    <div class="section-label">Subject-wise</div>
    ${SUBJECTS.map((s, i) => {
      const p = per[i];
      return `<div class="card tight" data-sub="${s.id}" style="cursor:pointer">
        <div class="row between"><b class="sub-${s.id}">${esc(s.name)}</b>
          <button class="linklike" data-topics="${s.id}">topic breakdown ▾</button></div>
        <div style="margin-top:8px">
          ${prow('Guide content', p.contentPct)}
          ${prow('Guide questions', p.questionPct)}
          ${prow('Concepts mastered', pct(p.mastered, p.conceptsTotal))}
        </div>
        <div class="statline" style="margin-top:6px">
          <span>Mastered <b>${p.mastered}</b></span><span>Learning <b>${p.learning}</b></span>
          <span>Weak <b>${p.weak}</b></span><span>Rev due <b>${p.dueRev}</b></span>
        </div>
        <div class="topics-detail hidden" id="topics-${s.id}" style="margin-top:10px">
          ${TOPICS.filter(t => t.subjectId === s.id).map(t => {
            const tp = topicProgress(t.id);
            if (!tp.content.total && !tp.questions.total && !tp.concepts) return '';
            return `<div class="prow"><span class="plabel">${esc(t.name)}</span>
              <div class="bar"><span style="width:${pct(tp.content.done, tp.content.total)}%"></span></div>
              <span class="pval">${pct(tp.content.done, tp.content.total)}%</span></div>
              <div class="small" style="margin:-4px 0 6px 102px">questions ${pct(tp.questions.done, tp.questions.total)}% · mastered ${tp.mastered}/${tp.concepts}${tp.weak ? ` · <span style="color:var(--bad);font-weight:700">weak ${tp.weak}</span>` : ''}</div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('')}

    ${days.length ? `
    <div class="section-label">Last active days</div>
    <div class="card tight">
      ${days.map(([d, v]) => `<div class="row between" style="padding:4px 0">
        <span class="small" style="flex:0 0 84px;font-weight:700">${fmtDate(d)}</span>
        ${bar(pct(v.q, Math.max(...days.map(([, x]) => x.q))))}
        <span class="small" style="flex:0 0 110px;text-align:right">${v.q} Q · ${v.c} ✓ · ${v.min} min</span>
      </div>`).join('')}
    </div>` : ''}

    ${weak.length ? `
    <div class="section-label">Weak concept bank (${weak.length})</div>
    <div class="card tight">
      <table class="ttable"><thead><tr><th>Concept</th><th>Status</th><th>✗/✓</th><th>Next rev.</th></tr></thead>
      <tbody>${weak.map(w => `<tr>
        <td>${esc(w.concept.title)}<br><span class="small">${esc(TOPIC_BY_ID[w.concept.topicId]?.name || '')}</span></td>
        <td>${statusChip(w.record.status)}</td>
        <td>${w.record.wrong} / ${w.record.correct}</td>
        <td class="small">${w.record.nextRev ? fmtDate(w.record.nextRev) : '—'}</td>
      </tr>`).join('')}</tbody></table>
    </div>` : ''}

    <div class="section-label">Data</div>
    <div class="card">
      <p class="small">Your progress lives in this browser (local storage). Export a backup file anytime, or import it on another device.</p>
      <div class="row">
        <button class="btn" data-act="export">Export backup (JSON)</button>
        <button class="btn" data-act="import">Import backup</button>
        <button class="btn danger" data-act="reset">Reset all progress</button>
      </div>
      <input type="file" id="importfile" accept="application/json,.json" class="hidden">
    </div>
  `);

  $$('[data-topics]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    $('#topics-' + b.dataset.topics).classList.toggle('hidden');
  }));
  $$('[data-sub]').forEach(c => c.addEventListener('click', () => nav(`#/study/${c.dataset.sub}`)));

  $$('[data-act]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'export') {
      const blob = new Blob([S.exportJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `rrb-t3-progress-${S.today()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast('Backup downloaded ✓');
    }
    if (a === 'import') $('#importfile').click();
    if (a === 'reset') {
      confirmModal('Reset EVERYTHING?', 'This deletes all progress, weak concepts, plans and imported guides from this browser. This cannot be undone.', () => {
        S.reset();
        location.hash = '#/home';
        location.reload();
      }, 'Yes, reset all');
    }
  }));
  $('#importfile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await S.importJSON(await file.text());
      toast('Backup imported ✓');
      location.reload();
    } catch (err) {
      toast('Import failed: ' + err.message);
    }
  });
}
