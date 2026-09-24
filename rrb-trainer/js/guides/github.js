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
import { parseGuide, finalizeGuide, extractPdfText } from './importer.js';
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

/* ---------- progress-preserving import ----------
   Same repo file → same guide id. On re-sync:
   - section read-state is carried over by (chapter + title) match
   - question stats (attempts) are carried over by question-text match
   - answers the USER set for "needs answers" questions are kept
   Nothing is silently reset.                                        */
export function importGuideText(text, meta, stableId) {
  const carry = snapshotOld(stableId);
  const parsed = parseGuide(text, meta);
  parsed.id = stableId; // stable id → stable section/question ids
  const mappings = {};
  parsed.sections.forEach((sec, i) => {
    mappings[i] = sec.guessTopicId ? { topicId: sec.guessTopicId } : { extra: sec.guessExtra || 'x-misc' };
  });
  const guide = finalizeGuide(parsed, mappings);
  guide.source = 'github';
  guide.repoPath = meta.repoPath || meta.fileName || null;
  guide.autoMapped = true;
  applyCarry(guide, carry);
  S.save();
  return guide;
}

/* Ingest a prebuilt guide JSON (bundled sync data or exported guide file)
   under a stable id, with the same progress preservation. */
export function ingestPrebuiltGuide(data, stableId) {
  const carry = snapshotOld(stableId);
  const guide = JSON.parse(JSON.stringify(data));
  guide.id = stableId;
  guide.source = 'github';
  guide.autoMapped = true;
  /* re-key section/question ids to the stable guide id (they may have been
     exported under a different guide id) */
  guide.sections = (guide.sections || []).map((sec, i) => ({ ...sec, id: `g:${stableId}:${i}`, index: i }));
  const secByOldId = new Map((data.sections || []).map((sec, i) => [sec.id, guide.sections[i]]));
  guide.questions = (guide.questions || []).map((q, qi) => {
    const sec = secByOldId.get(q.sectionId) || guide.sections[0];
    return { ...q, id: `g:${stableId}:${sec ? sec.index : 0}:${qi}`, guideId: stableId, sectionId: sec ? sec.id : null };
  });
  S.state.guides[stableId] = guide;
  Bank.addGuideQuestions(guide.questions);
  applyCarry(guide, carry);
  S.save();
  return guide;
}

/* Snapshot + clear the old guide's progress so stale ids cannot leak
   into the freshly imported guide (ids can collide when indices match). */
function snapshotOld(stableId) {
  const old = S.state.guides[stableId];
  if (!old) return null;
  const carry = { reads: {}, qstats: {}, answers: {} };
  for (const s of old.sections || []) {
    const r = S.state.read[s.id];
    if (r) { carry.reads[normKey(s.chapter + ' ' + s.title)] = r; delete S.state.read[s.id]; }
  }
  for (const q of old.questions || []) {
    const st = S.state.qstats[q.id];
    if (st) { carry.qstats[normKey(q.text)] = st; delete S.state.qstats[q.id]; }
    if (q.answerAvailable && q.answer >= 0) carry.answers[normKey(q.text)] = q.answer;
  }
  Bank.removeGuideQuestions(stableId);
  delete S.state.guides[stableId];
  return carry;
}

function applyCarry(guide, carry) {
  if (!carry) return;
  let restoredReads = 0, restoredStats = 0, restoredAnswers = 0;
  for (const sec of guide.sections) {
    const r = carry.reads[normKey(sec.chapter + ' ' + sec.title)];
    if (r) { S.state.read[sec.id] = r; restoredReads++; }
  }
  for (const q of guide.questions) {
    const st = carry.qstats[normKey(q.text)];
    if (st) { S.state.qstats[q.id] = st; restoredStats++; }
    const an = carry.answers[normKey(q.text)];
    if (an !== undefined && !q.answerAvailable && an >= 0 && an < (q.options || []).length) {
      q.answer = an; q.answerAvailable = true; q.answerCarried = true; restoredAnswers++;
    }
  }
  guide.carry = { reads: restoredReads, stats: restoredStats, answers: restoredAnswers };
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

  /* 1) live GitHub (works when the repository is public) */
  const status = await ghStatus();
  st.liveStatus = status.status;
  st.lastCheckAt = new Date().toISOString();
  if (status.status === 'connected') {
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
        Object.assign(entry, {
          status: 'imported', guideId: guide.id, title: guide.title,
          subject: subjectOfGuide(guide), sections: guide.sections.length,
          questions: guide.questions.length, syncedAt: new Date().toISOString(),
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
    S.save();
    return report;
  }

  /* 2) live not reachable → try bundled sync data (private-repo path) */
  const bundled = await bundledManifest();
  if (bundled && bundled.files.length) {
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
        const guide = ingestPrebuiltGuide(data, ghGuideId(f.path));
        Object.assign(entry, {
          status: 'imported', guideId: guide.id, title: guide.title,
          subject: subjectOfGuide(guide), sections: guide.sections.length,
          questions: guide.questions.length, syncedAt: new Date().toISOString(),
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
    st.lastSyncAt = new Date().toISOString();
    st.lastMode = 'bundled';
    report.ok = report.imported > 0;
    report.status = report.imported ? 'imported' : 'error';
    const why = status.status === 'auth-required' ? 'the repository is private' : 'GitHub could not be reached';
    report.message = `Live GitHub access is not available (${why}) — imported from the bundled sync of ${new Date(bundled.syncedAt).toLocaleString()}. ${report.imported} file(s) imported${report.failed ? `, ${report.failed} failed` : ''}.`;
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
