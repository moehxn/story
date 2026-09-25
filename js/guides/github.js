/* ============================================================
   GITHUB GUIDE SOURCE — moehxn/guideee (spec: GitHub connection)
   ------------------------------------------------------------
   - The app's Guides system can pull the user's REAL study guides
     straight from GitHub. No fake/sample content is ever created.
   - NO credentials, tokens or secrets are used or stored in the
     frontend. Browser requests to GitHub are UNAUTHENTICATED, so:
       * public repo      → full live sync works in the browser
       * private repo     → honest "Authentication Required" state
   - For private repos, tools/sync-guides.mjs (run in the Arena
     sandbox with the authenticated gh CLI) can bundle the parsed
     guides into data/guides/ — the app then imports that bundle
     honestly, labelled as a bundled sync with its date.
   - Progress-preserving re-sync: stable guide ids per repo file;
     section read-state, question stats and user-set answers are
     carried over by content match. Nothing is reset on update.
   ============================================================ */
import { S, Bank } from '../store.js';
import {
  parseGuide, finalizeGuide, extractPdfText,
  registerRuntimeGuide, getGuideFull, applyGuideOverrides, isRuntimeGuideLoaded,
} from './importer.js';
import { TOPIC_BY_ID, SUBJECTS } from '../syllabus.js';

export const GH = { owner: 'moehxn', repo: 'guideee', branch: 'main', label: 'moehxn/guideee' };

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';
const GUIDE_EXTS = ['.pdf', '.txt', '.md', '.markdown'];

/* Exact error messages required by the spec. */
export const MSG = {
  auth: 'Unable to access the GitHub guide. Please connect/authenticate GitHub or provide a supported guide file.',
  parse: 'This guide file could not be parsed automatically.',
};

export class GhError extends Error {
  constructor(kind, msg) { super(msg); this.kind = kind; }
}

/* ---------- persisted sync state ---------- */
export function ghSyncState() {
  if (!S.state.githubSync) {
    S.state.githubSync = { repo: GH.label, lastSyncAt: null, lastCheckAt: null, liveStatus: null, lastMode: null, files: [] };
  }
  const st = S.state.githubSync;
  if (!Array.isArray(st.files)) st.files = [];
  return st;
}

/* ---------- live GitHub checks (unauthenticated, CORS-enabled) ---------- */
export async function ghStatus() {
  try {
    const res = await fetch(`${API}/repos/${GH.owner}/${GH.repo}`, { headers: { Accept: 'application/vnd.github+json' } });
    if (res.status === 200) {
      const data = await res.json();
      return { status: 'connected', private: !!data.private, pushedAt: data.pushed_at || null, defaultBranch: data.default_branch || GH.branch };
    }
    if (res.status === 404) return { status: 'auth-required', message: 'Repository is private (or does not exist) — it cannot be read without authentication.' };
    if (res.status === 403) return { status: 'error', message: 'GitHub API rate limit reached. Please try again later.' };
    return { status: 'error', message: `GitHub responded with HTTP ${res.status}.` };
  } catch (e) {
    return { status: 'offline', message: 'Could not reach GitHub (you appear to be offline or GitHub is blocked).' };
  }
}

export async function listGuideFiles(branch = GH.branch) {
  const res = await fetch(`${API}/repos/${GH.owner}/${GH.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers: { Accept: 'application/vnd.github+json' } });
  if (res.status === 404) throw new GhError('auth', MSG.auth);
  if (!res.ok) throw new GhError('network', `GitHub file listing failed (HTTP ${res.status}).`);
  const data = await res.json();
  const files = (data.tree || [])
    .filter(t => t.type === 'blob' && GUIDE_EXTS.some(e => t.path.toLowerCase().endsWith(e)))
    .map(t => ({ path: t.path, sha: t.sha, size: t.size || 0 }));
  return { files, truncated: !!data.truncated };
}

/* ---------- file download + text extraction ---------- */
async function fetchFileText(file, branch) {
  const url = `${RAW}/${GH.owner}/${GH.repo}/${branch}/${file.path.split('/').map(encodeURIComponent).join('/')}`;
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new GhError('network', `Could not download “${file.path}” (network error).`);
  }
  if (!res.ok) throw new GhError('network', `Could not download “${file.path}” (HTTP ${res.status}).`);
  if (file.path.toLowerCase().endsWith('.pdf')) {
    let text = '';
    try {
      const blob = await res.blob();
      text = await extractPdfText(blob);
    } catch (e) {
      throw new GhError('parse', MSG.parse + (e && e.message ? ` (${e.message})` : ''));
    }
    if (!text || text.replace(/\s+/g, '').length < 40) {
      throw new GhError('parse', MSG.parse + ' The PDF has no extractable text layer (it may be a scanned/image PDF).');
    }
    return text;
  }
  const text = await res.text();
  if (!text.trim()) throw new GhError('parse', `The file “${file.path}” is empty.`);
  return text;
}

/* ---------- stable ids (same file → same guide id forever) ---------- */
export function ghGuideId(path) {
  const base = (path.split('/').pop() || 'guide').replace(/\.[^.]+$/, '');
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'guide';
  let h = 7;
  for (const ch of String(path)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `gh-${slug}-${h.toString(36)}`;
}

const normKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* Guides above this JSON size are kept as disk-backed stubs in localStorage
   (bundled data / runtime registry) so the 5 MB quota is never blown. */
export const STUB_THRESHOLD = 1.2 * 1024 * 1024;

/* ---------- content-stable ids ----------
   Section/question ids are hashes of their content, so a re-synced guide
   keeps the SAME ids for unchanged content → read-state, attempt stats and
   user answers survive updates by construction, even when positions shift. */
const fnv1a = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
};

export function stableIds(guide) {
  const used = new Set();
  const unique = (base) => { let id = base, n = 2; while (used.has(id)) id = `${base}-${n++}`; used.add(id); return id; };
  const oldToNew = new Map();
  guide.sections = (guide.sections || []).map((sec) => {
    const nid = unique(`g:${guide.id}:s${fnv1a(normKey(sec.chapter + '|' + sec.title))}`);
    oldToNew.set(sec.id, nid);
    return { ...sec, id: nid };
  });
  guide.questions = (guide.questions || []).map((q) => {
    const nid = unique(`g:${guide.id}:q${fnv1a(normKey(q.text))}`);
    const secId = oldToNew.get(q.sectionId) || q.sectionId;
    return { ...q, id: nid, guideId: guide.id, sectionId: secId };
  });
  return guide;
}

/* Remove orphaned progress entries of this guide (sections/questions that no
   longer exist after an update). User overrides on still-existing ids stay. */
function cleanOrphans(guide) {
  const valid = new Set([...guide.sections.map(s => s.id), ...guide.questions.map(q => q.id)]);
  const prefix = `g:${guide.id}:`;
  for (const key of Object.keys(S.state.read)) if (key.startsWith(prefix) && !valid.has(key)) delete S.state.read[key];
  for (const key of Object.keys(S.state.qstats)) if (key.startsWith(prefix) && !valid.has(key)) delete S.state.qstats[key];
}

/* Decide how a guide persists: small → full in state (localStorage);
   large → light stub in state + full content in the runtime registry. */
function persistGuide(guide, { bundledFile = null } = {}) {
  const size = JSON.stringify(guide).length;
  const large = size > STUB_THRESHOLD;
  let stub = null;
  if (large) {
    stub = {
      id: guide.id, stub: true, bundledFile,
      title: guide.title, source: guide.source || 'github',
      repoPath: guide.repoPath || null, fileName: guide.fileName || null,
      importedAt: guide.importedAt, verified: false, autoMapped: true,
      sections: guide.sections.map(sec => ({
        id: sec.id, index: sec.index, chapter: sec.chapter, title: sec.title,
        topicId: sec.topicId || null, inSyllabus: !!sec.inSyllabus,
        extraBucket: sec.extraBucket || null, include: sec.include !== false,
        questionCount: sec.questionCount || 0,
      })),
      questions: [],
      qTotal: guide.questions.length,
      qNoAns: guide.questions.filter(q => !q.answerAvailable).length,
      answerOverrides: {}, mapOverrides: {},
    };
    /* keep the previous user choices for this stable guide id */
    const prev = S.state.guides[guide.id];
    if (prev) {
      if (prev.verified) stub.verified = true;
      stub.answerOverrides = { ...(prev.answerOverrides || {}) };
      stub.mapOverrides = { ...(prev.mapOverrides || {}) };
    }
    S.state.guides[guide.id] = stub;
    registerRuntimeGuide(guide);
  } else {
    S.state.guides[guide.id] = guide;
    Bank.addGuideQuestions(guide.questions);
  }
  return { guide, large, stub };
}

/* ---------- import paths ---------- */
export function importGuideText(text, meta, stableId) {
  /* snapshot answers the USER set on the previous version of this guide
     (either directly in a small guide or as stub overrides) so a live
     re-sync never loses them */
  const old = S.state.guides[stableId];
  const oldFull = old ? (old.stub ? getGuideFull(stableId) : old) : null;
  const oldAnsByText = new Map();
  if (oldFull) {
    for (const q of oldFull.questions || []) {
      if (q.userAnswered && q.answer >= 0) oldAnsByText.set(normKey(q.text), q.answer);
    }
  }
  const parsed = parseGuide(text, meta);
  parsed.id = stableId;
  const mappings = {};
  parsed.sections.forEach((sec, i) => {
    mappings[i] = sec.guessTopicId ? { topicId: sec.guessTopicId } : { extra: sec.guessExtra || 'x-misc' };
  });
  let guide = finalizeGuide(parsed, mappings);
  guide.source = 'github';
  guide.repoPath = meta.repoPath || meta.fileName || null;
  guide.autoMapped = true;
  guide = stableIds(guide);
  /* re-apply user answers by content match (answers parsed from the guide
     itself always win when present) */
  for (const q of guide.questions) {
    const a = oldAnsByText.get(normKey(q.text));
    if (a !== undefined && !q.answerAvailable && a >= 0 && a < (q.options || []).length) {
      q.answer = a; q.answerAvailable = true; q.userAnswered = true;
    }
  }
  cleanOrphans(guide);
  const res = persistGuide(guide);
  if (res.large) applyGuideOverrides(res.guide); // user answers/mapping/verified
  S.save();
  return res.guide;
}

/* Ingest a prebuilt guide JSON (bundled sync data or exported guide file)
   under a stable id. Content-stable ids keep all progress on re-sync. */
export function ingestPrebuiltGuide(data, stableId, opts = {}) {
  let guide = JSON.parse(JSON.stringify(data));
  guide.id = stableId;
  guide.source = 'github';
  guide.autoMapped = true;
  guide = stableIds(guide);
  cleanOrphans(guide);
  const res = persistGuide(guide, { bundledFile: opts.bundledFile || null });
  if (res.large) applyGuideOverrides(res.guide); // user answers/mapping/verified
  S.save();
  return res.guide;
}

/* Ensure the FULL content of a (possibly stub) guide is loaded — bundled
   file for disk-backed guides. Returns the full guide or null. */
export async function ensureGuideFull(guideId) {
  const full = getGuideFull(guideId);
  if (full) return full;
  const stub = S.state.guides[guideId];
  if (!stub || !stub.stub || !stub.bundledFile) return null;
  try {
    const res = await fetch('data/guides/' + stub.bundledFile);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    let guide = { ...data, id: guideId };
    guide = stableIds(guide);
    applyGuideOverrides(guide);
    registerRuntimeGuide(guide);
    return guide;
  } catch (e) {
    return null;
  }
}

/* ---------- boot: load bundled (disk-backed) guides ----------
   Fetches data/guides/*.json for every stub guide and registers their
   questions into the runtime Bank. Honest failure — no faking. */
export async function bootBundledGuides() {
  const stubs = Object.values(S.state.guides || {}).filter(g => g.stub && g.bundledFile);
  if (!stubs.length) return { loaded: 0, failed: [] };
  const failed = [];
  let loaded = 0;
  for (const stub of stubs) {
    const full = await ensureGuideFull(stub.id);
    if (full) loaded++;
    else failed.push(stub.title || stub.id);
  }
  if (failed.length) console.warn('[guides] bundled files failed to load:', failed);
  return { loaded, failed };
}

/* ---------- subject detection (from the guide's own section mapping) ---------- */
export function subjectOfGuide(guide) {
  const counts = {};
  for (const sec of guide.sections) {
    if (sec.inSyllabus && sec.topicId) {
      const sid = TOPIC_BY_ID[sec.topicId]?.subjectId;
      if (sid) counts[sid] = (counts[sid] || 0) + 1;
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!best) return guide.sections.some(s => s.include) ? 'Guide extra' : '—';
  const mixed = Object.keys(counts).length > 1 ? ' (+)' : '';
  const name = (SUBJECTS.find(s => s.id === best[0]) || {}).name || best[0];
  return name + mixed;
}

/* ---------- bundled sync data (data/guides/, written by tools/sync-guides.mjs) ---------- */
export async function bundledManifest() {
  try {
    const res = await fetch('data/guides/manifest.json');
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.repo !== GH.label || !Array.isArray(data.files)) return null;
    return data;
  } catch (e) { return null; }
}

/* ---------- SYNC (the "Sync Guides" button) ---------- */
export async function syncGuides({ onProgress } = {}) {
  const st = ghSyncState();
  const report = { ok: false, mode: null, status: null, imported: 0, failed: 0, files: [], message: '' };

  /* bundled sync data (pre-parsed by tools/sync-guides.mjs) — when present it
     is preferred over re-downloading 100+ MB of PDFs; changed files are
     fetched live below. */
  const bundled = await bundledManifest();
  const hasBundled = !!(bundled && bundled.files.length);

  /* 1) live GitHub (only when no bundled data exists) */
  const status = await ghStatus();
  st.liveStatus = status.status;
  st.lastCheckAt = new Date().toISOString();
  if (status.status === 'connected' && !hasBundled) {
    report.mode = 'live';
    let files = [];
    try {
      const listed = await listGuideFiles(status.defaultBranch || GH.branch);
      files = listed.files;
      if (listed.truncated) report.message = 'Note: the repository tree was truncated by GitHub — some files may be missing. ';
    } catch (e) {
      report.status = 'error'; report.message = e.message || 'Failed to list the repository files.';
      S.save(); return report;
    }
    if (!files.length) {
      report.status = 'connected';
      report.message = 'Connected to the repository, but no guide files (.pdf / .txt / .md) were found in it.';
      st.files = []; S.save();
      return report;
    }
    for (const f of files) {
      const entry = { path: f.path, sha: f.sha, size: f.size, status: 'importing' };
      try {
        const text = await fetchFileText(f, status.defaultBranch || GH.branch);
        const guide = importGuideText(text, {
          fileName: f.path, repoPath: f.path, title: titleFromPath(f.path),
        }, ghGuideId(f.path));
        const stubbed = !!(S.state.guides[guide.id] && S.state.guides[guide.id].stub);
        Object.assign(entry, {
          status: 'imported', guideId: guide.id, title: guide.title,
          subject: subjectOfGuide(guide), sections: guide.sections.length,
          questions: guide.questions.length, large: stubbed, syncedAt: new Date().toISOString(),
        });
        report.imported++;
      } catch (e) {
        entry.status = 'failed';
        entry.error = e.kind === 'parse' ? MSG.parse + (e.message && e.message !== MSG.parse ? ` — ${e.message.replace(MSG.parse, '').trim()}` : '') : (e.message || 'Failed.');
        if (e.kind === 'auth') { report.status = 'auth-required'; report.message = MSG.auth; S.save(); return report; }
        report.failed++;
      }
      st.files = upsertFile(st.files, entry);
      report.files.push(entry);
      onProgress?.(entry);
      S.save();
    }
    st.lastSyncAt = new Date().toISOString();
    st.lastMode = 'live';
    report.ok = report.imported > 0;
    report.status = report.imported ? 'imported' : 'error';
    report.message = report.message + (report.failed
      ? `Imported ${report.imported} of ${report.imported + report.failed} files. ${report.failed} file(s) could not be parsed — see the list below.`
      : `Imported ${report.imported} file(s) from GitHub ✓`);
    if (S.save() === false) report.message += ' ⚠️ Browser storage is full — this large guide may not persist. Reload and re-sync, or use a smaller file.';
    return report;
  }

  /* 2) bundled sync data (repo unreachable, or handled above with live refresh) */
  if (hasBundled) {
    report.mode = 'bundled';
    let available = 0;
    for (const f of bundled.files) {
      const entry = { path: f.path, sha: f.sha, size: f.size, status: 'importing' };
      if (f.status === 'failed' || !f.guideFile) {
        entry.status = 'failed';
        entry.error = f.error || MSG.parse;
        report.failed++;
        st.files = upsertFile(st.files, entry);
        report.files.push(entry);
        continue;
      }
      try {
        const res = await fetch('data/guides/' + f.guideFile);
        if (!res.ok) throw new Error(`bundled file missing (${res.status})`);
        const data = await res.json();
        const guide = ingestPrebuiltGuide(data, ghGuideId(f.path), { bundledFile: f.guideFile });
        const stubbed = !!(S.state.guides[guide.id] && S.state.guides[guide.id].stub);
        Object.assign(entry, {
          status: 'imported', guideId: guide.id, title: guide.title,
          subject: subjectOfGuide(guide), sections: guide.sections.length,
          questions: guide.questions.length, large: stubbed, guideFile: f.guideFile,
          syncedAt: new Date().toISOString(),
        });
        report.imported++; available++;
      } catch (e) {
        entry.status = 'failed';
        entry.error = e.message || 'Bundled guide could not be read.';
        report.failed++;
      }
      st.files = upsertFile(st.files, entry);
      report.files.push(entry);
      onProgress?.(entry);
      S.save();
    }
    /* the repository is reachable: fetch only files that CHANGED since the
       bundled sync (re-downloading the whole 100+ MB of PDFs is unnecessary) */
    let changedCount = 0;
    if (status.status === 'connected') {
      try {
        const { files: liveFiles } = await listGuideFiles(status.defaultBranch || GH.branch);
        const known = new Map(st.files.map(f => [f.path, f]));
        const changed = liveFiles.filter(f => !known.get(f.path) || known.get(f.path).sha !== f.sha);
        changedCount = changed.length;
        for (const f of changed) {
          const entry = { path: f.path, sha: f.sha, size: f.size, status: 'importing' };
          try {
            const text = await fetchFileText(f, status.defaultBranch || GH.branch);
            const guide = importGuideText(text, { fileName: f.path, repoPath: f.path, title: titleFromPath(f.path) }, ghGuideId(f.path));
            const stubbed = !!(S.state.guides[guide.id] && S.state.guides[guide.id].stub);
            Object.assign(entry, {
              status: 'imported', guideId: guide.id, title: guide.title,
              subject: subjectOfGuide(guide), sections: guide.sections.length,
              questions: guide.questions.length, large: stubbed, live: true, syncedAt: new Date().toISOString(),
            });
            report.imported++;
          } catch (e) {
            entry.status = 'failed';
            entry.error = e.kind === 'parse' ? MSG.parse : (e.message || 'Failed.');
            report.failed++;
          }
          st.files = upsertFile(st.files, entry);
          report.files.push(entry);
          S.save();
        }
      } catch (e) { /* live listing unavailable — bundled import above is still honest */ }
    }

    st.lastSyncAt = new Date().toISOString();
    st.lastMode = 'bundled';
    report.ok = report.imported > 0;
    report.status = report.imported ? 'imported' : 'error';
    if (status.status === 'connected') {
      report.message = `Imported ${report.imported} file(s) from the bundled sync of ${new Date(bundled.syncedAt).toLocaleDateString()} (fast, offline)` +
        (changedCount ? ` + ${changedCount} changed file(s) fetched live from GitHub` : ' — no changes on GitHub since the bundle') +
        (report.failed ? `. ${report.failed} file(s) could not be parsed — see the list below.` : '.');
    } else {
      const why = status.status === 'auth-required' ? 'the repository is private' : 'GitHub could not be reached';
      report.message = `Live GitHub access is not available (${why}) — imported from the bundled sync of ${new Date(bundled.syncedAt).toLocaleString()}. ${report.imported} file(s) imported${report.failed ? `, ${report.failed} failed` : ''}.`;
    }
    S.save();
    return report;
  }

  /* 3) nothing accessible — honest failure, nothing faked */
  report.status = status.status;
  report.message = MSG.auth;
  S.save();
  return report;
}

/* ---------- CHECK FOR UPDATES ---------- */
export async function checkForUpdates() {
  const st = ghSyncState();
  const status = await ghStatus();
  st.liveStatus = status.status;
  st.lastCheckAt = new Date().toISOString();
  const out = { status: status.status, changed: [], message: '', checkedAt: st.lastCheckAt };
  if (status.status !== 'connected') {
    out.message = status.status === 'auth-required' ? MSG.auth : (status.message || 'Could not check for updates.');
    S.save();
    return out;
  }
  let files = [];
  try {
    files = (await listGuideFiles(status.defaultBranch || GH.branch)).files;
  } catch (e) {
    out.status = 'error'; out.message = e.message || 'Failed to list repository files.';
    S.save(); return out;
  }
  const known = new Map(st.files.map(f => [f.path, f]));
  for (const f of files) {
    const k = known.get(f.path);
    if (!k) out.changed.push({ path: f.path, change: 'added' });
    else if (k.sha && f.sha && k.sha !== f.sha) out.changed.push({ path: f.path, change: 'changed' });
  }
  for (const [path] of known) if (!files.some(f => f.path === path)) out.changed.push({ path, change: 'removed' });
  out.message = out.changed.length
    ? `${out.changed.length} guide file(s) changed on GitHub since the last sync — run “Sync Guides” to import the updates (your progress is preserved).`
    : 'Up to date — no guide files have changed since the last sync.';
  S.save();
  return out;
}

/* ---------- helpers ---------- */
function upsertFile(files, entry) {
  const i = files.findIndex(f => f.path === entry.path);
  if (i >= 0) files[i] = { ...files[i], ...entry };
  else files.push(entry);
  return files;
}

export function titleFromPath(path) {
  const base = (path.split('/').pop() || 'Guide').replace(/\.[^.]+$/, '');
  return base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase()) || 'GitHub guide';
}

/* UI badge state from persisted sync state */
export function ghBadge() {
  const st = S.state.githubSync;
  if (!st || (!st.lastSyncAt && !st.liveStatus)) return { label: 'Not checked yet', cls: 'gray' };
  const importedSome = st.files?.some(f => f.status === 'imported');
  if (st.lastSyncAt && importedSome) return { label: 'Imported', cls: 'green' };
  if (st.liveStatus === 'connected') return { label: 'Connected', cls: 'blue' };
  if (st.liveStatus === 'auth-required') return { label: 'Authentication Required', cls: 'red' };
  if (st.liveStatus === 'offline') return { label: 'Offline', cls: 'gray' };
  if (st.liveStatus) return { label: 'Error', cls: 'red' };
  return { label: 'Not checked yet', cls: 'gray' };
}
