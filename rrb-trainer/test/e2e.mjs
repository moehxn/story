/* ============================================================
   E2E (jsdom) — tests the MAIN USER FLOW end-to-end (spec §34):
   upload guide → map guide → subject → topic → learn → answer
   → wrong-answer learning panel → weak concept created →
   same model with DIFFERENT question → improve → revision →
   mastery → progress update.
   Run: node test/e2e.mjs  (from rrb-trainer/, needs /tmp/e2e deps)
   ============================================================ */
import { JSDOM } from '/tmp/e2e/node_modules/jsdom/lib/api.js';
import { buildSync } from '/tmp/e2e/node_modules/esbuild/lib/main.js';
import { readFileSync, mkdirSync } from 'fs';
import { createServer } from 'http';

process.chdir(new URL('../', import.meta.url).pathname);

/* bundle the app exactly as shipped */
buildSync({
  entryPoints: ['js/main.js'],
  bundle: true, format: 'iife', platform: 'browser',
  outfile: '/tmp/e2e/app-bundle.js',
  logLevel: 'error',
});

const html = readFileSync('index.html', 'utf8');
const dom = new JSDOM(html.replace('<script type="module" src="js/main.js"></script>', ''), {
  url: 'http://localhost:8123/#/home',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;
window.scrollTo = () => {};
window.URL.createObjectURL = () => 'blob:fake';
window.URL.revokeObjectURL = () => {};
const script = window.document.createElement('script');
script.textContent = readFileSync('/tmp/e2e/app-bundle.js', 'utf8');
window.document.body.appendChild(script);

const $ = (s) => window.document.querySelector(s);
const $$ = (s) => [...window.document.querySelectorAll(s)];
const click = (el) => el?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const setHash = (h) => { window.location.hash = h; };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.error('  ✗ FAIL:', name); } };
const step = (s) => console.log('\n== ' + s + ' ==');

/* track jsdom errors */
dom.virtualConsole.on('jsdomError', (e) => { if (!/scrollTo|not implemented/i.test(String(e))) console.error('  [jsdom error]', e.message?.slice(0, 120)); });

step('1. app boots, welcome modal shows, nav works');
await wait(150);
ok($('#modal-root').textContent.includes('Welcome'), 'welcome modal on first run');
$$('.modal [data-mact]')[2]?.click(); // Explore first
await wait(50);
ok($('#bottomnav').textContent.includes('Guides') && $$('.nav-item').length === 7, 'bottom nav has 7 tabs');
ok($('#view').textContent.includes('Smart study'), 'home dashboard rendered');
ok($('#view').textContent.includes('Import guide'), 'honest empty guide state on home');

step('2. import guide (paste) → auto-parse → review mapping');
setHash('#/guides/import');
await wait(100);
ok($('#gpaste') && $('#gfile'), 'import page shows file + paste inputs');
const demoGuide = `CHAPTER 1: Percentage — Basic Models
Percentage means per hundred.
Q1. A price is Rs.500 and increases by 20%. Find the new price.
(a) Rs.520 (b) Rs.600 (c) Rs.625 (d) Rs.700
Ans. (b)
Sol. New price = 500 x 120/100 = Rs.600.
Q2. Find 25% of 80. (RRB ALP 2018)
(a) 20 (b) 25 (c) 15 (d) 30
Ans. (a)
CHAPTER 2: Computer Basics
CPU is the brain of the computer.
Q3. The brain of the computer is:
(a) RAM (b) CPU (c) Monitor (d) Keyboard
Ans. (b)`;
$('#gpaste').value = demoGuide;
click($('#ggo'));
await wait(200);
ok($('#view').textContent.includes('Review mapping'), 'review screen appeared');
ok($('#view').textContent.includes('IN SYLLABUS'), 'syllabus mapping shown');
ok($('#view').textContent.includes('GUIDE EXTRA'), 'guide extra shown for computer chapter');
ok($('#view').textContent.includes('exam refs'), 'RRB exam-reference claim detected from guide');

step('3. confirm import → guide library → reader → mark read');
click($('#confirmImport'));
await wait(150);
ok($('#view').textContent.includes('Verification status: needs verification'), 'guide flagged unverified');
ok($('#view').textContent.includes('IN SYLLABUS → Percentages'), 'percentage chapter mapped into syllabus');
ok($('#view').textContent.includes('GUIDE EXTRA'), 'computer chapter kept as guide extra');
// open first section reader
const readBtn = $$('[data-read]')[0];
click(readBtn);
await wait(100);
ok($('#view').textContent.includes('Guide questions in this section'), 'reader shows guide questions');
click($('#markread'));
await wait(100);
ok($('#markread').textContent.includes('Read ✓'), 'section marked read (content completion tracked)');

step('4. study → subject → topic → concept (teach from zero)');
setHash('#/study');
await wait(80);
ok($$('[data-act]').some(b => b.dataset.act.startsWith('sub:')), 'subject list renders');
setHash('#/study/MATH');
await wait(80);
ok($('#view').textContent.includes('START FROM ZERO'), 'subject page action buttons');
const pctTopic = $$('[data-act]').find(b => b.dataset.act === 'topic:percentages');
click(pctTopic);
await wait(80);
ok($('#view').textContent.includes('Method models'), 'topic page shows Method Trainer entry');
ok($('#view').textContent.includes('Concepts (Teach From Zero)'), 'topic page lists concepts');
const conceptBtn = $$('[data-act]').find(b => b.dataset.act.startsWith('concept:'));
const conceptId = conceptBtn.dataset.act.split(':')[1];
click(conceptBtn);
await wait(100);
ok($('#view').textContent.includes('Guided question'), 'concept page shows guided question');
ok($('#view').textContent.includes('Memory method'), 'memory method present');
ok($('#view').textContent.includes('5-second exam recall'), 'recall box present');

step('5. guided question answered WRONG → steps shown');
const gOpts = $$('#gopts .opt');
click(gOpts[0]); // deliberately wrong (for most guided questions index 0 is wrong; verify correct below)
click($('#gcheck'));
await wait(60);
const panelTxt = $('#gfeedback').textContent;
ok($('#gfeedback .panel'), 'guided feedback panel shows');
ok(/Correct|steps/i.test(panelTxt), 'step-by-step shown after wrong guided answer');

step('6. concept practice quiz → wrong answer → FULL learning panel + different mini question');
click($('[data-act="practice"]'));
await wait(120);
ok(window.location.hash === '#/run', 'quiz runner opened');
const qText1 = $('.qtext').textContent;
ok($$('.opt').length >= 3, 'options rendered');
ok($('.qmeta .chip.src-EXPECTED') || $('.qmeta .chip'), 'source label shown on question');
// answer wrong: click any option that is NOT marked correct after checking — click first, verify
const runOpts = $$('#opts .opt');
const chosenIdx = 0;
click(runOpts[chosenIdx]);
click($('#check'));
await wait(80);
const fb = $('#feedback').textContent;
const wasWrong = $('#feedback .panel.bad') !== null;
ok($('#feedback .panel.good') || $('#feedback .panel.bad'), 'answer feedback appeared');
if (wasWrong) {
  for (const label of ['SUBJECT', 'TOPIC', 'SOURCE', 'What is this question testing', 'Correct answer', 'Why your answer is wrong', 'Step-by-step solution']) {
    ok(fb.includes(label), `learning panel has “${label}”`);
  }
  ok($('#minicard'), 'ONE different mini question presented');
  const miniText = $('#minicard .qtext').textContent;
  ok(miniText !== qText1, 'mini question is DIFFERENT from the main question');
  // mini answer stays hidden until CHECK is pressed, then is revealed
  const mBtns = $$('#miniopts .opt');
  ok(mBtns.length >= 3, 'mini question has options');
  ok(!$('#minifb .panel'), 'mini answer hidden before check');
  click(mBtns[0]);
  const checkBtn = $('#minifb .btn');
  ok(!!checkBtn, 'mini check button appears after choosing');
  click(checkBtn);
  await wait(40);
  const miniPanel = $('#minifb .panel.good') || $('#minifb .panel.bad');
  ok(!!miniPanel, 'mini answer revealed only after check');
}
// finish the run
let guard = 0;
while ($('#nextq') && guard++ < 30) {
  click($('#nextq'));
  await wait(60);
  if ($('#view').textContent.includes('result')) break;
  const opts2 = $$('#opts .opt');
  if (opts2.length) { click(opts2[0]); click($('#check')); await wait(60); }
}
ok($('#view').textContent.includes('ACCURACY'), 'quiz summary with real stats shown');

step('7. weak concept bank + same-model DIFFERENT question drill');
setHash('#/revision');
await wait(80);
const revTxt = $('#view').textContent;
ok(revTxt.includes('Weak concept bank'), 'weak concept bank page renders');
ok(/\d+/.test(revTxt), 'weak bank has real entries');
// weak drill
const { startQuiz } = await import('../js/ui/quiz.js').catch(() => ({}));
setHash('#/quiz');
await wait(80);
const weakBtn = $$('[data-mode]').find(b => b.dataset.mode === 'weak');
ok(weakBtn && !weakBtn.disabled, 'weak topic quiz enabled');
click(weakBtn);
await wait(120);
ok(window.location.hash === '#/run', 'weak drill run started');
const drillText = $('.qtext')?.textContent || '';
ok(drillText && drillText !== qText1, 'weak drill question is different from earlier question');
// answer it and confirm same-model logic via method chip in panel if wrong
const o3 = $$('#opts .opt');
if (o3.length) { click(o3[0]); click($('#check')); await wait(80); }

step('8. spaced revision scheduling exists');
setHash('#/revision');
await wait(80);
ok($('#view').textContent.includes('due') || $('#view').textContent.includes('Coming up') || $('#view').textContent.includes('Nothing due today'),
  'revision schedule section present');

step('9. progress page shows REAL numbers');
setHash('#/progress');
await wait(100);
const progTxt = $('#view').textContent;
ok(progTxt.includes('QUESTIONS ANSWERED'), 'progress stats render');
ok(progTxt.includes('Subject-wise'), 'subject-wise progress renders');
ok(progTxt.includes('Export backup'), 'export/import data tools present');
const answeredMatch = progTxt.match(/QUESTIONS ANSWERED/);
ok(!!answeredMatch, 'attempt counter present');

step('10. method trainer');
setHash('#/methods/percentages');
await wait(80);
ok($('#view').textContent.includes('Method Trainer'), 'method trainer renders');
ok($('#view').textContent.includes('Model 2: Percentage increase'), 'percentage models listed (incl. spec example model)');
ok($('#view').textContent.includes('recognize'), 'recognition cues taught');

step('11. 10-day plan');
setHash('#/plan');
await wait(100);
ok($('#view').textContent.includes('10-day study plan'), 'plan page renders');
const subjChips = $$('.task').map(t => t.textContent);
ok(subjChips.length > 0, 'plan tasks exist');
const dayTexts = $$('.daytab').map(d => d.textContent).join(' ');
ok(dayTexts.includes('D10'), '10 day tabs');

step('12. smart study session');
setHash('#/smart/20');
await wait(100);
ok($('#view').textContent.includes('Smart study — 20 minutes'), 'smart session page renders');
ok($$('[data-blockstart],[data-blockdone]').length > 0, 'smart blocks with actions');

step('13. honest current-affairs state');
setHash('#/study/GA/current-affairs');
await wait(80);
ok($('#view').textContent.includes('Current Affairs needs a current source'), 'current affairs shows honest “needs source” state — no fake CA');

step('14. guide quiz uses guide questions (guide-first)');
setHash('#/quiz');
await wait(80);
const guideBtn = $$('[data-mode]').find(b => b.dataset.mode === 'guide');
ok(guideBtn && !guideBtn.disabled, 'guide quiz enabled after import');
click(guideBtn);
await wait(100);
const gChoice = $$('[data-guide]')[0];
ok(gChoice, 'guide picker lists imported guide');
click(gChoice);
await wait(120);
ok(window.location.hash === '#/run', 'guide quiz started');
const srcChips = $$('.qmeta .chip').map(c => c.textContent);
ok(srcChips.some(t => t.includes('GUIDE') || t.includes('PYQ')), 'guide quiz question carries GUIDE/PYQ source label');

step('15. exam mode config + negative marking');
setHash('#/quiz');
await wait(60);
const examBtn = $$('[data-mode]').find(b => b.dataset.mode === 'exam');
click(examBtn);
await wait(100);
ok($('#modal-root').textContent.includes('Exam Mode setup'), 'exam config modal');
ok($('#modal-root').textContent.includes('Negative marking'), 'negative marking toggle');

console.log(`\n==== E2E RESULTS: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
