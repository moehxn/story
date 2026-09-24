#!/usr/bin/env node
/* ============================================================
   SYNC GUIDES FROM GITHUB (sandbox-side) — moehxn/guideee
   ------------------------------------------------------------
   Pulls the user's REAL guide files from the GitHub repository
   using the authenticated `gh` CLI (the Arena sandbox token),
   parses them with the app's REAL importer pipeline, and writes
   prebuilt guide JSON + a manifest into ../data/guides/.

   The browser app then imports this bundle honestly (labelled
   "bundled sync") when the repository is not publicly reachable.

   Rules:
   - Uses `gh` for all GitHub access. Tokens are NEVER written to
     any file, never printed, never embedded in the output.
   - Writes NOTHING if access or listing fails — no fake data.
   - Files that cannot be parsed are recorded as failed with the
     exact reason; they are never faked.

   Usage (from rrb-trainer/):
     node tools/sync-guides.mjs
   PDF support needs pdf-parse:
     cd tools && npm install   (or have it available in /tmp/e2e)
   ============================================================ */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/* Overrides (also used by the test suite):
   - GUIDE_REPO=owner/repo   → different repository
   - --local <dir>           → read guide files from a local directory
                               (no GitHub access; useful to pre-check parsing)
   - --out <dir>             → write the manifest/guides somewhere else       */
const argv = process.argv.slice(2);
const flagVal = (name) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const LOCAL_DIR = flagVal('--local');
const OUT_DIR = flagVal('--out') || join(ROOT, 'data', 'guides');

const [OWNER, REPO] = (process.env.GUIDE_REPO || 'moehxn/guideee').split('/');
const GUIDE_EXTS = ['.pdf', '.txt', '.md', '.markdown'];
const MAX_BYTES = 60 * 1024 * 1024; // 60 MB safety guard

const MSG = {
  auth: 'Unable to access the GitHub guide. Please connect/authenticate GitHub or provide a supported guide file.',
  parse: 'This guide file could not be parsed automatically.',
};

/* ---------- gh helpers (token stays in the environment/CLI) ---------- */
function gh(args, opts = {}) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, ...opts });
}
function ghJson(args) {
  return JSON.parse(gh(args));
}

/* ---------- pdf text extraction (pdfjs-dist legacy build works in Node) ---------- */
let pdfjsLib = null;
async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  const roots = [join(HERE, 'node_modules'), '/tmp/e2e/node_modules'];
  const tryPaths = [];
  for (const r of roots) {
    tryPaths.push(join(r, 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')); // v4+
    tryPaths.push(join(r, 'pdfjs-dist', 'legacy', 'build', 'pdf.js'));   // v3 (CJS)
  }
  for (const p of tryPaths) {
    if (existsSync(p)) {
      const mod = await import(pathToFileURL(p));
      pdfjsLib = (mod.default && mod.default.getDocument) ? mod.default : mod;
      return pdfjsLib;
    }
  }
  console.error('pdfjs-dist is not installed.');
  console.error('Run:  cd ' + HERE + ' && npm install');
  console.error('(or make it available at /tmp/e2e/node_modules)');
  process.exit(2);
}

/* Same line-assembly logic as the browser path (js/guides/importer.js). */
async function pdfToText(buf, timeoutMs = 120000) {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: false, disableFontFace: true });
  let timer = null;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => {
      try { task.destroy(); } catch (e) {}
      rej(new Error('PDF parsing timed out'));
    }, timeoutMs);
    timer.unref?.(); // never hold the process open for the guard alone
  });
  try {
    return await Promise.race([runExtract(task), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function runExtract(task) {
  const doc = await task.promise;
  const out = [];
  const max = Math.min(doc.numPages, 400);
  for (let p = 1; p <= max; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let last = null, line = '';
    const lines = [];
    for (const item of content.items) {
      if (last !== null && Math.abs(item.transform[5] - last) > 2) { lines.push(line); line = ''; }
      line += item.str + (item.hasEOL ? '' : ' ');
      last = item.transform[5];
    }
    lines.push(line);
    out.push(lines.join('\n'));
  }
  return out.join('\n\n');
}

/* ---------- boot the app's real importer (with a storage shim) ---------- */
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
};
globalThis.window = globalThis;

const store = await import(pathToFileURL(join(ROOT, 'js', 'store.js')));
const { S } = store;
const githubMod = await import(pathToFileURL(join(ROOT, 'js', 'guides', 'github.js')));
const importer = await import(pathToFileURL(join(ROOT, 'js', 'guides', 'importer.js')));
S.init();

/* ============================================================ */
async function main() {
  console.log(`Guide sync ${LOCAL_DIR ? 'from LOCAL directory ' + LOCAL_DIR : 'from GitHub'} — ${OWNER}/${REPO}\n`);

  let files = [];

  if (LOCAL_DIR) {
    /* ---------- local mode: list files from a directory ---------- */
    if (!existsSync(LOCAL_DIR)) { console.error(`✗ Directory not found: ${LOCAL_DIR}`); process.exit(1); }
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p);
        else if (GUIDE_EXTS.some(e => name.toLowerCase().endsWith(e))) {
          const buf = readFileSync(p);
          files.push({ path: relative(LOCAL_DIR, p), sha: createHash('sha1').update(buf).digest('hex'), size: st.size, buf });
        }
      }
    };
    walk(LOCAL_DIR);
  } else {
    /* ---------- GitHub mode: authenticated gh CLI ---------- */
    let repo;
    try {
      repo = ghJson(['api', `repos/${OWNER}/${REPO}`]);
    } catch (e) {
      const notFound = String(e.stderr || e.message || '').includes('404') || String(e.status || '').includes('404');
      console.error(notFound
        ? `✗ No access to ${OWNER}/${REPO} (it is private or does not exist for this token).`
        : `✗ GitHub access failed: ${String(e.stderr || e.message).split('\n')[0]}`);
      console.error('\n' + MSG.auth);
      console.error('\nNothing was written. No guide data was faked.');
      process.exit(1);
    }
    const branch = repo.default_branch || 'main';
    console.log(`✓ Repository accessible (default branch: ${branch}, private: ${repo.private})`);

    const tree = ghJson(['api', `repos/${OWNER}/${REPO}/git/trees/${encodeURIComponent(branch)}?recursive=1`]);
    files = (tree.tree || [])
      .filter(t => t.type === 'blob' && GUIDE_EXTS.some(e => t.path.toLowerCase().endsWith(e)))
      .map(t => ({ path: t.path, sha: t.sha, size: t.size || 0 }));
    if (tree.truncated) console.warn('! GitHub truncated the tree listing — some files may be missing.');
  }

  if (!files.length) {
    console.error('✗ No guide files (.pdf/.txt/.md) found.');
    console.error('Nothing was written.');
    process.exit(1);
  }
  console.log(`✓ Found ${files.length} guide file(s):`);
  files.forEach(f => console.log(`   • ${f.path} (${(f.size / 1024).toFixed(0)} KB)`));

  /* 3) download + parse each file */
  let pdfParse = null;
  mkdirSync(OUT_DIR, { recursive: true });
  const manifestFiles = [];
  let imported = 0, failed = 0;

  for (const f of files) {
    const entry = { path: f.path, sha: f.sha, size: f.size, status: 'failed', error: null, guideFile: null };
    try {
      if (f.size > MAX_BYTES) throw new Error(`file is larger than ${MAX_BYTES / 1024 / 1024} MB — skipped`);
      console.log(`\n→ ${f.path}`);
      let buf = f.buf;
      if (!buf) {
        const blob = ghJson(['api', `repos/${OWNER}/${REPO}/git/blobs/${f.sha}`]);
        buf = Buffer.from(blob.content, blob.encoding === 'base64' ? 'base64' : 'utf8');
      }

      let text = '';
      if (f.path.toLowerCase().endsWith('.pdf')) {
        text = await pdfToText(buf);
        if (!text || text.replace(/\s+/g, '').length < 40) {
          throw new Error('PDF has no extractable text layer (scanned/image PDF)');
        }
      } else {
        text = buf.toString('utf8');
      }
      if (!text.trim()) throw new Error('file is empty');

      /* parse with the app's REAL pipeline + stable id */
      const stableId = githubMod.ghGuideId(f.path);
      const parsed = importer.parseGuide(text, { fileName: f.path, title: githubMod.titleFromPath(f.path) });
      parsed.id = stableId;
      const mappings = {};
      parsed.sections.forEach((sec, i) => {
        mappings[i] = sec.guessTopicId ? { topicId: sec.guessTopicId } : { extra: sec.guessExtra || 'x-misc' };
      });
      const guide = importer.finalizeGuide(parsed, mappings);
      guide.source = 'github';
      guide.repoPath = f.path;
      guide.autoMapped = true;

      const guideFile = `${stableId}.json`;
      writeFileSync(join(OUT_DIR, guideFile), JSON.stringify({ type: 'rrb-guide', ...guide }, null, 1));
      Object.assign(entry, {
        status: 'imported',
        guideFile,
        title: guide.title,
        subject: githubMod.subjectOfGuide(guide),
        sections: guide.sections.length,
        questions: guide.questions.length,
      });
      imported++;
      console.log(`  ✓ imported: ${guide.sections.length} sections, ${guide.questions.length} questions (subject: ${githubMod.subjectOfGuide(guide)})`);
    } catch (e) {
      entry.error = `${MSG.parse} ${e.message || ''}`.trim();
      failed++;
      console.log(`  ✗ FAILED: ${entry.error}`);
    }
    manifestFiles.push(entry);
  }

  /* 4) manifest */
  const manifest = {
    type: 'rrb-guide-manifest',
    repo: `${OWNER}/${REPO}`,
    branch: LOCAL_DIR ? 'local' : (repo ? (repo.default_branch || 'main') : 'main'),
    localMode: !!LOCAL_DIR,
    syncedAt: new Date().toISOString(),
    files: manifestFiles,
    note: 'Parsed from the real guide files by tools/sync-guides.mjs. Guide content is not automatically verified.',
  };
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 1));

  console.log(`\n==== SYNC COMPLETE: ${imported} imported, ${failed} failed ====`);
  if (failed) console.log('Failed files were recorded honestly in the manifest — they are never faked.');
  console.log(`Output: ${OUT_DIR}`);
  console.log('Commit data/guides/ so the app can import this bundle in the browser.');
}

main().catch(e => {
  console.error(`✗ Unexpected error: ${e.stack || e.message || e}`);
  console.error('Nothing was faked. Fix the error above and re-run.');
  process.exit(1);
});
