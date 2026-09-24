/* Route sweep: render every registered route directly; catch any exception. */
import { buildSync } from '/tmp/e2e/node_modules/esbuild/lib/main.js';
import { createRequire } from 'module';
await buildSync({ entryPoints: ['js/main.js'], bundle: true, format: 'cjs', outfile: '/tmp/e2e/app-bundle.js', platform: 'browser' });
const require = createRequire(import.meta.url);
const { JSDOM } = require('/tmp/e2e/node_modules/jsdom/lib/api.js');
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

const routes = ['#/home','#/study','#/study/maths','#/study/maths/percentages','#/concept/m-pct-1','#/methods/percentages','#/quiz','#/quiz/exam','#/revision','#/progress','#/guides','#/guides/import','#/plan','#/plan/1','#/plan/5','#/smart/10','#/smart/30','#/more','#/study/science','#/study/reasoning','#/study/ga','#/study/science/physics-motion','#/study/ga/current-affairs','#/concept/does-not-exist','#/guide/none','#/reader/none/0'];
let pass = 0, fail = 0;
const errors = [];
window.addEventListener('error', e => errors.push(String(e.error || e.message)));
for (const r of routes) {
  errors.length = 0;
  window.location.hash = r;
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await sleep(60);
  const err = errors.length ? errors[0] : null;
  const empty = !window.document.querySelector('#view') || window.document.querySelector('#view').textContent.trim().length < 10;
  if (err || empty) { fail++; console.log(`  ✗ ${r}${err ? ' — ERROR: ' + err.split('\n')[0] : ' — EMPTY RENDER'}`); }
  else { pass++; console.log(`  ✓ ${r}`); }
}
console.log(`\n==== ROUTE SWEEP: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
