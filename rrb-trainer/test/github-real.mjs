/* ============================================================
   REAL-DATA GITHUB GUIDE TEST — uses the actual bundled sync
   output in data/guides/ (your real repository's parsed books).
   Verifies: stub persistence (localStorage safety), bank
   registration, reader/guide pages, guide-first quizzes with
   real questions, wrong-answer learning panel, progress
   preservation across re-sync, and syllabus integration.
   Run: node test/github-real.mjs   (from rrb-trainer/)
   ============================================================ */
import { buildSync } from '/tmp/e2e/node_modules/esbuild/lib/main.js';
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'node:fs';

if (!existsSync('data/guides/manifest.json')) {
  console.log('No bundled guide data (data/guides/) — run tools/sync-guides.mjs first. Skipping.');
  process.exit(0);
}
const manifest = JSON.parse(readFileSync('data/guides/manifest.json', 'utf8'));

await buildSync({ entryPoints: ['js/main.js'], bundle: true, format: 'cjs', outfile: '/tmp/e2e/app-bundle.js', platform: 'browser' });
const require = createRequire(import.meta.url);
const { JSDOM } = require('/tmp/e2e/node_modules/jsdom/lib/api.js');

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ FAIL: ' + name); } };

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"><header id="topbar"><div id="topbar-actions"></div></header><main id="view"></main><nav id="bottomnav"></nav><div id="modal-root"></div><div id="toast-root"></div></div></body></html>', {
  url: 'https://app.test/', runScripts: 'dangerously', pretendToBeVisual: true,
});
const { window } = dom;
window.scrollTo = () => {};
window.URL.createObjectURL = () => 'blob:x';
globalThis.window = window; globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
globalThis.location = window.location;
globalThis.history = window.history;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;

/* fetch stub: GitHub API unreachable (private) → forces the bundled path;
   data/guides/* serves the REAL synced files from disk */
globalThis.fetch = window.fetch = (url) => {
  url = String(url);
  if (url.includes('api.github.com')) return Promise.resolve(new Response('{"message":"Not Found"}', { status: 404 }));
  if (url.endsWith('data/guides/manifest.json')) return Promise.resolve(new Response(JSON.stringify(manifest), { status: 200 }));
  if (url.includes('data/guides/')) {
    const file = decodeURIComponent(url.split('data/guides/')[1]);
    try { return Promise.resolve(new Response(readFileSync('data/guides/' + file, 'utf8'), { status: 200 })); }
    catch (e) { return Promise.resolve(new Response('{"message":"Not Found"}', { status: 404 })); }
  }
  return Promise.resolve(new Response('{"message":"Not Found"}', { status: 404 }));
};

await import('/tmp/e2e/app-bundle.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await sleep(200);
const $ = (s) => window.document.querySelector(s);
const $$ = (s) => [...window.document.querySelectorAll(s)];
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const setHash = (h) => { window.location.hash = h; window.dispatchEvent(new window.HashChangeEvent('hashchange')); };
const state = () => JSON.parse(window.localStorage.getItem('rrb-t3-trainer-v1'));
const text = () => $('#view').textContent;

/* dismiss first-run welcome */
if ($('#modal-root .modal')) { const b = $('#modal-root .btn'); if (b) click(b); await sleep(50); }

console.log('\n== A. bundled sync of the REAL repository data (private repo path) ==');
setHash('#/guides'); await sleep(80);
ok(!!$('#ghcard'), 'Guides page shows the GitHub source card');
click($('#ghsync')); await sleep(6000); // big JSON parse + ingest
ok($('#ghbadge')?.textContent.includes('Imported'), 'status: Imported after bundled sync');
ok($('#ghreport').textContent.includes('bundled sync'), 'report explains bundled mode');
const st = state();
const stubGuides = Object.values(st.guides).filter(g => g.stub);
ok(stubGuides.length >= 1, 'large guides stored as light stubs (localStorage-safe)');
const lsSize = window.localStorage.getItem('rrb-t3-trainer-v1').length;
ok(lsSize < 600 * 1024, `localStorage stays small with 5,000+ question guide (${(lsSize / 1024).toFixed(0)} KB)`);
const mathsEntry = st.githubSync.files.find(f => f.path.includes('Railway_Maths'));
ok(mathsEntry && mathsEntry.questions > 4000, `maths book imported: ${mathsEntry?.questions} questions detected`);
ok(mathsEntry.subject.includes('Mathematics'), 'maths book subject detected');
const failedFiles = st.githubSync.files.filter(f => f.status === 'failed');
ok(failedFiles.length >= 8, `${failedFiles.length} scanned/unparseable PDFs recorded honestly as failed`);
const mathsStub = Object.values(st.guides).find(g => (g.qTotal || 0) > 4000);
ok(!!mathsStub, 'maths stub present in state');
ok(mathsStub.questions.length === 0, 'stub holds no question bodies (disk-backed)');
ok(mathsStub.sections.some(s => s.title === 'Number System' && s.inSyllabus), 'chapter "Number System" mapped IN SYLLABUS');

console.log('\n== B. guide detail page + reader with the real book ==');
setHash('#/guide/' + mathsStub.id); await sleep(2500); // async full load
ok(text().includes('Source: GitHub'), 'guide page shows GitHub source');
ok(text().includes('Railway_Maths_6200'), 'guide page shows the repo file name');
ok(text().includes('Number System'), 'chapters listed');
ok(/Practice guide questions \((\d{4})\)/.test(text()) && +RegExp.$1 > 2500, `practice button shows real answered-question count (${RegExp.$1})`);
ok(!text().includes('and 2158 more') || text().includes('more. The'), 'needs-answers list capped for the huge book');
setHash(`#/reader/${mathsStub.id}/0`); await sleep(2500);
ok($('.pagehead') && text().length > 500, 'reader loads the real section content (async full load)');
ok($$('#opts, #markread').length >= 0 && !!$('#markread'), 'reader mark-read control present');
click($('#markread')); await sleep(300);
ok($('#markread').textContent.includes('Read ✓'), 'real section marked read');

console.log('\n== C. guide-first quiz with REAL guide questions ==');
setHash('#/guide/' + mathsStub.id); await sleep(2000);
click($('[data-act="quizall"]')); await sleep(400);
ok(window.location.hash === '#/run', 'guide quiz started from the real book');
ok($$('#opts .opt').length >= 3, 'real guide question rendered with options');
ok($('.qmeta .chip.src-GUIDE') || $('.qmeta .chip.src-PYQ'), 'source label GUIDE/VERIFIED RRB-PYQ on the real question');
const qText1 = $('.qtext').textContent;
const opt0 = $$('#opts .opt')[0];
click(opt0); click($('#check')); await sleep(200);
ok($('#feedback .panel.good') || $('#feedback .panel.bad'), 'answer feedback shown for real guide question');
if ($('#feedback .panel.bad')) {
  const fb = $('#feedback').textContent;
  ok(fb.includes('SUBJECT') && fb.includes('TOPIC') && fb.includes('SOURCE'), 'wrong-answer learning panel with SUBJECT/TOPIC/SOURCE');
  ok(fb.includes('guide') || fb.includes('Guide'), 'panel references the guide');
  ok($('#minicard'), 'different mini-question offered');
}
let guard = 0;
while ($('#nextq') && guard++ < 20) { click($('#nextq')); await sleep(120); if (text().includes('ACCURACY')) break; const o = $$('#opts .opt'); if (o.length) { click(o[0]); click($('#check')); await sleep(120); } }
ok(text().includes('ACCURACY'), 'quiz summary with real stats');
const st2 = state();
const qstatsCount = Object.keys(st2.qstats).filter(id => id.startsWith('g:' + mathsStub.id + ':')).length;
ok(qstatsCount >= 1, `attempt stats recorded for real guide questions (${qstatsCount})`);

console.log('\n== D. re-sync preserves everything (stable content-hash ids) ==');
setHash('#/guides'); await sleep(80);
click($('#ghsync')); await sleep(6000);
const st3 = state();
ok(Object.values(st3.guides).filter(g => g.stub).length === stubGuides.length, 're-sync does not duplicate guides');
ok(st3.read[`g:${mathsStub.id}:s${st3.read ? Object.keys(st3.read).find(k => k.startsWith('g:' + mathsStub.id + ':s'))?.split(':s')[1] : ''}`] !== undefined || Object.keys(st3.read).some(k => k.startsWith('g:' + mathsStub.id + ':')), 'section read-state preserved after re-sync');
const qstatsAfter = Object.keys(st3.qstats).filter(id => id.startsWith('g:' + mathsStub.id + ':')).length;
ok(qstatsAfter >= qstatsCount, `attempt stats preserved after re-sync (${qstatsCount} → ${qstatsAfter})`);

console.log('\n== E. syllabus integration — real guide feeds the study tree ==');
setHash('#/study/MATH/number-system'); await sleep(120);
ok(text().includes('guide section'), 'Number System topic page shows the real guide chapter');

console.log(`\n==== REAL-DATA GITHUB TESTS: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
