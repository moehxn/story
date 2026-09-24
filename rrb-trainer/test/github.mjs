/* ============================================================
   GITHUB GUIDE SOURCE TESTS (jsdom + esbuild, no network)
   Covers: repo access states, auth handling, file discovery,
   sync + parse (live & bundled), source labels, syllabus mapping,
   progress preservation on re-sync, update detection, offline
   and partial-failure error states.
   Run: node test/github.mjs   (from rrb-trainer/)
   ============================================================ */
import { buildSync } from '/tmp/e2e/node_modules/esbuild/lib/main.js';
import { createRequire } from 'module';
import { readFileSync } from 'node:fs';

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
await import('/tmp/e2e/app-bundle.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await sleep(150);

const $ = (s) => window.document.querySelector(s);
const $$ = (s) => [...window.document.querySelectorAll(s)];
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const setHash = (h) => { window.location.hash = h; window.dispatchEvent(new window.HashChangeEvent('hashchange')); };
const text = () => $('#view').textContent;

/* ============ fetch stubbing ============ */
const GUIDES = {
  'maths-percentage.txt': `CHAPTER 1: Percentage
Percentage means per hundred. x% of N means x/100 times N.
To increase a value by r percent, multiply by (100 + r)/100.
Q1. A price is Rs.500 and increases by 20%. Find the new price.
(a) Rs.520 (b) Rs.600 (c) Rs.625 (d) Rs.700
Ans. (b)
Sol. New price = 500 x 120/100 = Rs.600.
Q2. After a 20% increase the price became Rs.600. The original price was:
(a) Rs.480 (b) Rs.500 (c) Rs.520 (d) Rs.580
Ans. (b)
`,
  'gk-static.md': `# Indian Railways — Firsts
The first passenger train in India ran between Bombay and Thane on 16 April 1853.
Q1. The first passenger train in India (1853) ran between:
(a) Bombay and Thane (b) Howrah and Delhi (c) Madras and Bangalore (d) Lahore and Delhi
Ans. (a)
`,
};
const GUIDES_V2 = {
  'maths-percentage.txt': GUIDES['maths-percentage.txt'] + `Q3. 50% of 90 is:
(a) 40 (b) 45 (c) 50 (d) 55
Ans. (b)
`,
};

let mode = 'private'; // 'private' | 'public' | 'public-v2' | 'offline' | 'bundled' | 'bundled-live'
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

function stubFetch(url, opts) {
  url = String(url);
  const api = 'https://api.github.com/repos/moehxn/guideee';
  if (mode === 'offline') return Promise.reject(new TypeError('Failed to fetch'));
  if (url === api) {
    if (mode === 'private' || mode === 'bundled') return Promise.resolve(json({ message: 'Not Found' }, 404));
    return Promise.resolve(json({ private: false, default_branch: 'main', pushed_at: '2026-09-20T10:00:00Z' }));
  }
  if (mode === 'bundled-live' && url.startsWith(api + '/git/trees')) {
    /* bundled data exists AND the live repository has one file with a NEW sha */
    const tree = [
      { type: 'blob', path: 'gk-static.md', sha: '6f3c1b769f151dd2bac9ff65507782b7ff44a068', size: 281 },
      { type: 'blob', path: 'reasoning-coding.txt', sha: 'SHA-RC-NEW', size: 400 },
    ];
    return Promise.resolve(json({ tree, truncated: false }));
  }
  if (url.startsWith(api + '/git/trees')) {
    const v2 = mode === 'public-v2';
    const tree = [
      { type: 'blob', path: 'maths-percentage.txt', sha: v2 ? 'SHA-MATHS-2' : 'SHA-MATHS-1', size: 500 },
      { type: 'blob', path: 'gk-static.md', sha: 'SHA-GK-1', size: 300 },
      { type: 'blob', path: 'broken.pdf', sha: 'SHA-PDF-1', size: 4000 },
      { type: 'blob', path: 'logo.png', sha: 'SHA-PNG', size: 9000 },
    ];
    return Promise.resolve(json({ tree, truncated: false }));
  }
  if (url.startsWith('https://raw.githubusercontent.com/moehxn/guideee/main/')) {
    const f = url.split('/main/')[1];
    if (f === 'maths-percentage.txt') return Promise.resolve(new Response(mode === 'public-v2' ? GUIDES_V2[f] : GUIDES[f], { status: 200 }));
    if (f === 'reasoning-coding.txt' && mode === 'bundled-live') return Promise.resolve(new Response(readFileSync('/tmp/guide-fixture/reasoning-coding.txt', 'utf8') + 'Q3. In a row of 40 students, if a boy is 12th from the left, he is:\n(a) 28th from the right (b) 29th from the right (c) 27th from the right (d) 30th from the right\nAns. (b)\n', { status: 200 }));
    if (f === 'gk-static.md') return Promise.resolve(new Response(GUIDES[f], { status: 200 }));
    if (f === 'broken.pdf') return Promise.resolve(new Response(new Blob([new Uint8Array([1, 2, 3, 4, 5])]), { status: 200 }));
    return Promise.resolve(json({ message: 'Not Found' }, 404));
  }
  if (url.endsWith('data/guides/manifest.json')) {
    if (mode !== 'bundled' && mode !== 'bundled-live') return Promise.resolve(json({ message: 'Not Found' }, 404));
    const m = JSON.parse(readFileSync('/tmp/guide-out/manifest.json', 'utf8'));
    return Promise.resolve(json(m));
  }
  if (url.includes('data/guides/')) {
    if (mode !== 'bundled' && mode !== 'bundled-live') return Promise.resolve(json({ message: 'Not Found' }, 404));
    const file = url.split('data/guides/')[1];
    const data = readFileSync('/tmp/guide-out/' + file, 'utf8');
    return Promise.resolve(new Response(data, { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  return Promise.resolve(json({ message: 'Not Found' }, 404));
}
window.fetch = stubFetch;
globalThis.fetch = stubFetch; // the bundle runs in Node scope — bare fetch resolves here

/* pdf.js stub for the browser PDF path (CDN is unreachable in tests) */
window.pdfjsLib = {
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.reject(new Error('Invalid PDF structure')) }),
};

/* ============ A. private repo → Authentication Required ============ */
console.log('\n== A. private repository → honest Authentication Required ==');
setHash('#/guides'); await sleep(60);
ok($('#ghcard'), 'GitHub source card renders on Guides page');
ok($('#ghcard').textContent.includes('RRB Technician Guides'), 'card title "RRB Technician Guides"');
ok($('#ghcard').textContent.includes('Source: GitHub'), 'card shows "Source: GitHub"');
ok($('#ghcard').textContent.includes('Repository: guideee'), 'card shows "Repository: guideee"');
ok($('#ghcard').textContent.includes('moehxn/guideee'), 'card shows owner/repo');
ok(!!$('#ghsync') && !!$('#ghcheck'), 'Sync Guides + Check for Updates buttons exist');
ok($('#ghbadge').textContent.includes('Not checked'), 'initial status honest (not checked)');

click($('#ghcheck')); await sleep(120);
ok($('#ghbadge').textContent.includes('Authentication Required'), 'status becomes Authentication Required');
ok($('#ghreport').textContent.includes('Unable to access the GitHub guide. Please connect/authenticate GitHub or provide a supported guide file.'), 'exact access-failure message shown');

const guidesBefore = Object.keys(JSON.parse(window.localStorage.getItem('rrb-t3-trainer-v1') || '{}').guides || {}).length;
click($('#ghsync')); await sleep(200);
ok($('#ghreport').textContent.includes('Unable to access the GitHub guide'), 'sync fails honestly on private repo');
const stA = JSON.parse(window.localStorage.getItem('rrb-t3-trainer-v1'));
ok(Object.keys(stA.guides || {}).length === guidesBefore, 'no guides faked/imported on failed sync');
ok((stA.githubSync?.files || []).length === 0, 'sync state has no invented files');

/* ============ B. public repo → live sync with partial failure ============ */
console.log('\n== B. public repository → live sync (2 imported, 1 unparseable PDF, png ignored) ==');
mode = 'public';
setHash('#/guides'); await sleep(50);
click($('#ghsync')); await sleep(400);
ok($('#ghbadge').textContent.includes('Imported'), 'status becomes Imported');
ok($('#ghreport').textContent.includes('Imported 2 of 3 files'), 'partial success reported honestly (2 of 3)');
ok($('#ghreport').textContent.includes('broken.pdf'), 'failed file listed by name');
ok($('#ghreport').textContent.includes('This guide file could not be parsed automatically.'), 'exact PDF-parse failure message');
const stB = JSON.parse(window.localStorage.getItem('rrb-t3-trainer-v1'));
const ghFiles = stB.githubSync.files;
ok(ghFiles.length === 3, 'png correctly ignored; 3 guide files tracked');
ok(ghFiles.filter(f => f.status === 'imported').length === 2, '2 files imported');
ok(ghFiles.find(f => f.path === 'broken.pdf').status === 'failed', 'broken pdf recorded failed');
const mathGuideId = ghFiles.find(f => f.path === 'maths-percentage.txt').guideId;
ok(/^gh-maths-percentage-/.test(mathGuideId), 'stable guide id derived from repo path');
const mathGuide = stB.guides[mathGuideId];
ok(!!mathGuide && mathGuide.questions.length === 2, 'maths guide imported with 2 questions');
ok(mathGuide.questions.every(q => q.source === 'GUIDE'), 'all imported questions labelled GUIDE');
ok(mathGuide.questions.every(q => q.answer >= 0 && q.answerAvailable), 'guide answers detected (b) → index 1');
ok(mathGuide.sections.some(s => s.topicId === 'percentages' && s.inSyllabus), 'chapter auto-mapped IN SYLLABUS → percentages');
ok(mathGuide.autoMapped === true && mathGuide.repoPath === 'maths-percentage.txt', 'auto-mapped flag + repo path preserved');
ok(ghFiles.find(f => f.path === 'maths-percentage.txt').subject.includes('Math'), 'subject detected (Mathematics)');
ok(ghFiles.find(f => f.path === 'gk-static.md').subject.includes('General Awareness') || ghFiles.find(f => f.path === 'gk-static.md').subject === 'GA', 'subject detected (GA)');
ok($$('#ghcard [data-ghopen]').length === 2, 'imported files listed with open buttons');
ok($('#ghcard').textContent.includes('sections') && $('#ghcard').textContent.includes('questions'), 'file rows show chapter + question counts');

/* guide page shows GitHub source */
setHash('#/guide/' + mathGuideId); await sleep(60);
ok($('#view').textContent.includes('Source: GitHub'), 'guide page shows GitHub source');
ok($('#view').textContent.includes('maths-percentage.txt'), 'guide page shows repo file path');

/* GUIDE questions feed the syllabus topic page (guide-first integration) */
setHash('#/study/MATH/percentages'); await sleep(60);
ok($('#view').textContent.includes('guide section'), 'topic page shows linked guide section (GUIDE CONTENT)');
setHash('#/guide/' + mathGuideId); await sleep(50);

/* ============ C. progress preserved across re-sync ============ */
console.log('\n== C. progress preservation on re-sync (updated file) ==');
/* mark section read via the real reader */
setHash(`#/reader/${mathGuideId}/0`); await sleep(60);
click($('#markread')); await sleep(60);
ok($('#markread').textContent.includes('Read ✓'), 'section marked read before update');
/* practise a guide question via the real quiz flow */
setHash('#/guide/' + mathGuideId); await sleep(50);
click($('[data-act="quizall"]')); await sleep(120);
ok(window.location.hash === '#/run', 'guide quiz started');
const opt = $$('#opts .opt')[0];
click(opt); click($('#check')); await sleep(120);
let guard = 0;
while ($('#nextq') && guard++ < 20) { click($('#nextq')); await sleep(60); if (text().includes('ACCURACY')) break; const o = $$('#opts .opt'); if (o.length) { click(o[0]); click($('#check')); await sleep(60); } }
ok(text().includes('ACCURACY'), 'guide quiz completed with real attempt history');

const stC1 = JSON.parse(window.localStorage.getItem('rrb-t3-trainer-v1'));
const qstatsCount = Object.keys(stC1.qstats).filter(id => id.startsWith('g:' + mathGuideId)).length;
ok(qstatsCount >= 1, 'attempt stats recorded for guide questions');

/* re-sync: same files, maths file changed (new question added) */
mode = 'public-v2';
setHash('#/guides'); await sleep(50);
click($('#ghsync')); await sleep(400);
const stC2 = JSON.parse(window.localStorage.getItem('rrb-t3-trainer-v1'));
ok(Object.keys(stC2.guides).length === Object.keys(stC1.guides).length, 're-sync does not duplicate guides');
const math2 = stC2.guides[mathGuideId];
ok(math2.questions.length === 3, 'updated file adds the new question');
ok(Object.keys(stC2.read).some(k => k.startsWith(`g:${mathGuideId}:s`)), 'section read-state preserved across update (stable content-hash section id)');
const qstatsAfter = Object.keys(stC2.qstats).filter(id => id.startsWith('g:' + mathGuideId));
const attemptedAfter = math2.questions.filter(q => stC2.qstats[q.id]).length;
ok(attemptedAfter >= 1, 'question attempt stats carried over to same-text question (no reset)');
const oldQ = mathGuide.questions[0];
ok(math2.questions.some(q => q.text === oldQ.text && stC2.qstats[q.id]), 'the same question keeps its attempt history after re-sync');

/* read progress visible on the guides page */
setHash('#/guides'); await sleep(50);
ok($('#ghcard').textContent.includes('Imported'), 'status stays Imported after re-sync');

/* ============ D. check for updates ============ */
console.log('\n== D. update detection ==');
mode = 'public-v2';
setHash('#/guides'); await sleep(40);
click($('#ghcheck')); await sleep(200);
ok($('#ghreport').textContent.includes('Up to date'), 'no changes → "Up to date" message');

mode = 'public'; // maths sha differs from the synced v2
setHash('#/guides'); await sleep(40);
click($('#ghcheck')); await sleep(200);
ok($('#ghreport').textContent.includes('changed on GitHub'), 'changed file detected');
ok($('#ghreport').textContent.includes('maths-percentage.txt'), 'changed file named in report');

/* ============ E. offline ============ */
console.log('\n== E. offline handling ==');
mode = 'offline';
setHash('#/guides'); await sleep(40);
click($('#ghcheck')); await sleep(200);
ok($('#ghbadge').textContent.includes('Offline') || $('#ghreport').textContent.includes('Could not reach GitHub'), 'offline state reported honestly');
const stE = JSON.parse(window.localStorage.getItem('rrb-t3-trainer-v1'));
ok(Object.keys(stE.guides).length === Object.keys(stC2.guides).length, 'offline check does not touch imported guides');

/* ============ F. bundled sync data (private repo + tools output) ============ */
console.log('\n== F. bundled sync data (from tools/sync-guides.mjs output) ==');
mode = 'bundled';
setHash('#/guides'); await sleep(40);
click($('#ghsync')); await sleep(500);
ok($('#ghbadge').textContent.includes('Imported'), 'bundled sync imports');
ok($('#ghreport').textContent.includes('bundled sync'), 'report explains bundled mode');
ok($('#ghreport').textContent.includes('private'), 'report explains why live was not used');
const stF = JSON.parse(window.localStorage.getItem('rrb-t3-trainer-v1'));
const bundledIds = Object.keys(stF.guides).filter(id => id.startsWith('gh-'));
ok(bundledIds.some(id => id.startsWith('gh-maths-percentage-')), 'bundled maths guide imported under stable id');
ok(bundledIds.some(id => id.startsWith('gh-reasoning-coding-')), 'bundled reasoning guide imported');
ok(bundledIds.some(id => id.startsWith('gh-gk-static-')), 'bundled GA guide imported');
const bundledMaths = stF.guides[bundledIds.find(id => id.startsWith('gh-maths-percentage-'))];
ok(bundledMaths.questions.every(q => q.source === 'GUIDE'), 'bundled questions labelled GUIDE');
ok(bundledMaths.sections.some(s => s.topicId === 'percentages'), 'bundled guide mapped to syllabus');
ok(stF.githubSync.files.some(f => f.path === 'scanned-notes.pdf' && f.status === 'failed'), 'bundled failure recorded honestly');
/* live sync guides from phase B/C are still there (nothing reset) */
ok(stF.guides[mathGuideId] !== undefined, 'previous live-imported guide untouched by bundled sync');

/* ============ G. bundled sync + changed file fetched live ============ */
console.log('\n== G. bundled sync with a changed file on GitHub (live refresh of just that file) ==');
mode = 'bundled-live';
setHash('#/guides'); await sleep(40);
click($('#ghsync')); await sleep(600);
ok($('#ghbadge').textContent.includes('Imported'), 'bundled + live refresh imports');
ok($('#ghreport').textContent.includes('fetched live from GitHub'), 'report mentions the live refresh of changed files');
const stG = JSON.parse(window.localStorage.getItem('rrb-t3-trainer-v1'));
const gRC = stG.githubSync.files.find(f => f.path === 'reasoning-coding.txt');
ok(gRC && gRC.live === true && gRC.status === 'imported' && gRC.sha === 'SHA-RC-NEW', 'changed file marked live-imported in sync state');
const gRCGuide = stG.guides[gRC.guideId];
ok(gRCGuide && gRCGuide.questions.length === 3, 'changed file content updated live (2 bundled + 1 new live question)');
ok(gRCGuide.id.startsWith('gh-reasoning-coding-'), 'updated guide keeps its stable id (no duplicate)');
const guidesBeforeG = Object.keys(stF.guides).length;
ok(Object.keys(stG.guides).length === guidesBeforeG, 'bundled + live refresh does not duplicate guides');
ok(stG.githubSync.files.find(f => f.path === 'gk-static.md') && !stG.githubSync.files.find(f => f.path === 'gk-static.md').live, 'unchanged bundled file NOT re-downloaded');

console.log(`\n==== GITHUB GUIDE TESTS: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
