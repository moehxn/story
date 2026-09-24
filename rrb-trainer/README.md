# RRB Technician Grade III — Smart Study & Quiz Trainer

A mobile-first, offline-first web app that works like **a personal RRB teacher + guide + quiz trainer**.
Built for someone starting from zero basics, with limited time (10 days), who wants to **understand
concepts and methods — not memorize questions**.

Everything in the app is real: real activity tracking, real progress, real sources. No fake buttons,
no placeholder pages, no dummy statistics, no invented PYQ labels.

---

## Run it

No build step, no dependencies:

```bash
# any static server, e.g.
npx serve .          # or  python3 -m http.server
```

Then open the page. All progress is saved in the browser's `localStorage`.
Export/import your data from **More → Data** (JSON file).

> PDF guide import loads `pdf.js` from a CDN the first time you use it (needs internet once).
> The **paste text** path works fully offline.

## Exam structure (indicative, not hard-coded)

| Section | Questions | Marks |
|---|---|---|
| Mathematics | 25 | 25 |
| General Intelligence & Reasoning | 25 | 25 |
| General Science | 40 | 40 |
| General Awareness | 10 | 10 |

The app treats this as an *indicative* pattern — exam mode lets you configure question counts,
duration and negative marking. The official syllabus topic list is the backbone of the Study tab;
guide material beyond the official list is kept as **GUIDE EXTRA**, clearly separated.

## How to start (first 5 minutes)

1. **Welcome** → the app shows the full learning flow.
2. **Guides → "RRB Technician Guides" card → Sync Guides** → pulls your real guides from the
   GitHub repository `moehxn/guideee` (see *GitHub guide source* below). Alternatively use
   manual import: paste or upload a guide (PDF/text). The app detects chapters, questions
   (with answers/solutions if present), formulas and RRB exam references, and maps sections to
   the official syllabus (IN SYLLABUS vs GUIDE EXTRA). Imported content is flagged
   **"not automatically verified"** — you verify it yourself guide-by-guide.
3. **Study → Subject → Topic** → learn each concept *from zero* (concept → formula or
   "No formula needed — use this rule" → method → guided question → step-by-step → memory
   method → 5-second recall). Guide sections appear inside their syllabus topics.
4. Answer questions. Wrong answers open the **full learning panel** and one **different**
   mini-question. Weak concepts go to the **weak bank** and get drilled with *same model,
   different questions*.
5. Revision is **spaced** (Day 1, 1, 2, 4, 7, 10) with different questions each time.
6. Use **Plan** (adaptive 10-day plan) or **Smart Study** (10/20/30/60 min) when short on time.

## GitHub guide source (`moehxn/guideee`)

The Guides page has a **RRB Technician Guides — Source: GitHub — Repository: guideee** card with
**Sync Guides** and **Check for Updates** buttons and a live status badge
(Connected / Authentication Required / Importing / Imported / Error).

- **Public repository** → "Sync Guides" downloads the guide files (.pdf/.txt/.md) directly in
  your browser, parses them (PDF via pdf.js), auto-maps chapters to the official syllabus and
  imports all questions with the `GUIDE` source label. Failed files are listed honestly
  ("This guide file could not be parsed automatically.") and never faked.
- **Private repository** → the browser cannot read it, and the app **never stores GitHub
  passwords or tokens**. The card shows an honest **Authentication Required** state with the
  message: *"Unable to access the GitHub guide. Please connect/authenticate GitHub or provide a
  supported guide file."* Two ways to make a private repo work:
  1. Grant the Arena sandbox's GitHub connection access to the repository (or make it public
     temporarily), then run the sandbox-side tool:
     `cd rrb-trainer/tools && npm install && node sync-guides.mjs`
     It pulls the real files with the authenticated `gh` CLI, parses them with the app's real
     pipeline and writes `data/guides/` (committed). The browser then imports that bundle
     (labelled "bundled sync" with its date) — `--local <dir>` pre-checks local files,
     `--out <dir>` redirects output, `GUIDE_REPO=owner/repo` changes the repository.
  2. Or import the guide files manually on the Guides page.
- **Check for Updates** compares the repository's current file SHAs with the last sync and
  reports added/changed/removed files ("run Sync Guides to import the updates").
- **Re-sync preserves everything**: guide ids are stable per repo file; section read-state,
  question attempt history and answers you set are carried over by content match. Updating a
  guide never resets your progress, weak concepts or mastery.
- Every guide file row shows subject, section/chapter count, questions found, progress and
  last-updated. Auto-mapped sections can be re-mapped on the guide's page
  ("Adjust syllabus mapping").

## Question sources (honesty contract)

Every question carries a visible source label, in priority order:

1. `GUIDE` — from your uploaded guide
2. `VERIFIED RRB/PYQ` — only when the guide/source explicitly claims RRB/previous-year origin
3. `OFFICIAL/VERIFIED` — official/verified material
4. `EXPECTED PRACTICE` — expected-pattern practice content
5. `AI-GENERATED PRACTICE` — freshly generated variants (always labeled, never called PYQ)

The app **never** invents exam years, dates, shifts or paper names. Uncertain sources are labeled
as uncertain or AI-generated. Current Affairs shows an honest "needs a current-affairs source"
state instead of serving stale facts.

## Learning & mastery logic

- **Maths from zero**: 12-part concept structure (what it is → why needed → basics → concept →
  formula or "No formula needed — use this rule" → method steps → guided question → practice →
  traps → memory method → 5-second recall → next). Method Trainer teaches *models* per topic
  (e.g. Percentage: x% of number, increase, decrease, reverse, successive, comparison, error)
  and then mixed practice **without telling you which model** — you learn method recognition.
- **Weakness ladder**: wrong 1× → explain + 1 similar-but-different question; wrong 2× → mistake
  explanation + 2 different same-model questions; wrong 3× → Teach-From-Zero with easy questions.
- **Mastery**: one correct answer is never mastery. 3 consecutive correct **plus** correct in
  mixed/exam context → `MASTERED`. Weak concept statuses: NEW / LEARNING / WEAK / IMPROVING / MASTERED.
- **Repetition rules**: same concept + same method + **different** question = encouraged;
  the **exact same** question only returns in revision/recall. Mastered models stop being drilled.
- **Subject teaching styles**: Math (concept→formula→recognition→calculation→mixed),
  Reasoning (concept→pattern→identify→method→new patterns→mixed), Science
  (concept→simple explanation→real-life example→rule→application→revision),
  GA (fact→context→why it matters→association→recall→spaced revision).

## Architecture

```
index.html            shell (topbar, view, bottomnav, modal/toast roots)
css/app.css           single mobile-first stylesheet
js/
  main.js             boot, router (hash routes), first-run welcome
  store.js            state (S) + content Bank + localStorage persistence + JSON export/import
  syllabus.js         official syllabus tree (4 subjects → topics → subtopics)
  core (ui/core.js)   render helpers, nav, modal, toast, bindActions, bottom nav
  content/            honest starter pack: 86 concepts, 9 methods, 89 questions,
                      38 checked generators (maths + reasoning), GA static GK
  engine/
    selector.js       adaptive question picker — guide-first priority, freshness (LRU),
                      fresh generated variants instead of repeating recent questions
    mastery.js        weak-concept statuses, spaced revision scheduling (1,1,2,4,7,10)
    plan.js           adaptive 10-day plan builder (all 4 subjects daily)
    smart.js          10/20/30/60-min smart session block allocator
  guides/
    importer.js       guide parsing: chapters, questions, answers, formulas, exam refs,
                      syllabus mapping (IN SYLLABUS / GUIDE EXTRA / skip), finalize
    github.js         GitHub guide source (moehxn/guideee): live status/sync/update check,
                      stable ids, progress-preserving re-sync, bundled-data import
  tools/
    sync-guides.mjs   sandbox-side sync via authenticated gh CLI → data/guides/ bundle
  data/guides/        (created by the tool) bundled manifest + parsed guide JSON
  ui/                 pages: home, study, quiz, revision, progress, guides, plan, more
test/
  smoke.mjs           content + engine unit/integration checks (47)
  e2e.mjs             full user-flow simulation via esbuild+jsdom (66 checks)
  routes.mjs          every route rendered headlessly (26 routes)
```

Data model: every question links `subject_id / topic_id / subtopic_id / concept_id / method_id /
source / source_reference / difficulty / question_type / guide_reference`, and every attempt is
recorded in attempt history. The store is a clean seam for a future Supabase migration — swap the
persistence layer in `store.js`; the rest of the app doesn't touch localStorage directly.

## Tests

```bash
node test/smoke.mjs   # content integrity, generators re-solved, mastery transitions, selector
node test/e2e.mjs     # import → learn → answer wrong → weak drill → revision → plan → exam
node test/routes.mjs  # all routes render, not-found handled gracefully
node test/github.mjs  # GitHub source: auth states, live+bundled sync, progress preservation,
                      # update detection, offline/partial-failure handling
```

## Data export / reset

More → Data: export full progress JSON, import it on another device/browser, or reset everything.
Guides → a guide's page has its own export/delete. Progress page also has per-data tools.
