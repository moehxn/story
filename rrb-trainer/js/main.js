/* ============================================================
   APP ENTRY — boot, routes, first-run welcome.
   ============================================================ */
import { S } from './store.js';
import { registerStarterContent } from './content/index.js';
import { rehydrateGuides } from './guides/importer.js';
import { route, render, nav, modal, toast } from './ui/core.js';
import { homePage } from './ui/home.js';
import { studyHome, subjectPage, topicPage, conceptPage, methodTrainerPage } from './ui/study.js';
import { quizHub, runPage } from './ui/quiz.js';
import { revisionPage } from './ui/revision.js';
import { progressPage } from './ui/progress.js';
import { guidesPage, importPage, guidePage, readerPage } from './ui/guides.js';
import { planPage, smartPage } from './ui/plan.js';
import { morePage } from './ui/more.js';

/* ---------- routes ---------- */
route('/home', homePage);
route('/study', studyHome);
route('/study/:subjectId', (p) => subjectPage(p.subjectId));
route('/study/:subjectId/:topicId', (p) => topicPage(p.subjectId, p.topicId));
route('/concept/:conceptId', (p) => conceptPage(p.conceptId));
route('/methods/:topicId', (p) => methodTrainerPage(p.topicId));
route('/quiz', quizHub);
route('/quiz/exam', async () => { quizHub(); const m = await import('./ui/quiz.js'); m.examConfig(); });
route('/run', runPage);
route('/revision', revisionPage);
route('/progress', progressPage);
route('/guides', guidesPage);
route('/guides/import', importPage);
route('/guide/:guideId', (p) => guidePage(p.guideId));
route('/reader/:guideId/:sectionId', (p) => readerPage(p.guideId, p.sectionId));
route('/plan', () => planPage());
route('/plan/:day', (p) => planPage(p.day));
route('/smart/:minutes', (p) => smartPage(p.minutes));
route('/more', morePage);

/* ---------- boot ---------- */
async function boot() {
  S.init();
  const stats = registerStarterContent();
  console.log('[boot] starter content:', stats);
  rehydrateGuides();

  /* load disk-backed (bundled GitHub) guides so their questions join the
     Bank before the first render; failure is honest, never faked */
  try {
    const gh = await import('./guides/github.js');
    const res = await gh.bootBundledGuides();
    if (res && res.loaded) console.log(`[boot] bundled guides loaded: ${res.loaded}`);
    if (res && res.failed && res.failed.length) console.warn('[boot] bundled guides failed:', res.failed);
  } catch (e) { console.warn('[boot] bundled guide load skipped:', e.message); }

  if (!location.hash) location.hash = '#/home';
  render();
  window.addEventListener('hashchange', render);

  if (!S.state.onboarded) {
    S.state.onboarded = true;
    S.save();
    modal({
      title: '👋 Welcome to your RRB Tech-III Trainer',
      body: `
        <p style="font-size:13.5px"><b>The learning flow:</b></p>
        <div class="kmap" style="margin:8px 0">
          Official syllabus <span class="arr">→</span> uploaded guide <span class="arr">→</span> subject
          <span class="arr">→</span> topic <span class="arr">→</span> concept <span class="arr">→</span> guide content
          <span class="arr">→</span> guide questions <span class="arr">→</span> practice <span class="arr">→</span> revision <span class="arr">→</span> mastery
        </div>
        <p style="font-size:13.5px"><b>Two things tracked separately:</b> guide/content completion and question/practice completion. Answering questions never marks content “completed”.</p>
        <p style="font-size:13.5px"><b>Honesty first:</b> the built-in Starter Pack is labeled EXPECTED PRACTICE. When you import your guides, they become the primary source — every question shows its true source, and nothing is ever faked as PYQ.</p>
        <p style="font-size:13.5px;color:var(--muted)">Start now with a 10-minute Smart Study, or import your guides first.</p>`,
      actions: [
        { label: 'Import my guides', onClick: () => nav('#/guides/import') },
        { label: 'Start 10-min study', cls: 'primary', onClick: () => nav('#/smart/10') },
        { label: 'Explore first' },
      ],
    });
  }
}
boot();
