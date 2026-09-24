/* ============================================================
   GUIDE IMPORT PIPELINE (spec §32)
   1. Read guide (txt / md / html / pdf / pasted text / exported guide JSON)
   2. Detect chapters / sections
   3. Detect questions (+ options, answers, solutions, exam references)
   4. Map sections to the OFFICIAL syllabus (IN SYLLABUS vs GUIDE EXTRA)
   5. Review UI (in ui/guides.js) → confirm → add to bank
   Imported guide content is NOT automatically verified (spec §28).
   Exam references are captured only when the guide itself states them.
   ============================================================ */
import { S, Bank } from '../store.js';
import { matchSyllabusTopic, matchGuideExtraBucket, TOPIC_BY_ID, SUBJECTS } from '../syllabus.js';

/* ---------------- helpers ---------------- */
const cap = (s, n) => (s || '').length > n ? s.slice(0, n) + '…' : (s || '');

const RE_OPTION = /^\s*[\(\[]?([a-dA-D1-4])[\)\].:\-]\s*(.+)$/;
const RE_ANS = /^\s*(?:Ans|Answer|ANS|ANSWER|Correct\s*(?:Answer|Option)?)\s*[.:\-–]?\s*(.*)$/i;
const RE_SOL = /^\s*(?:Sol|Solution|Solutions|Explanation|Explain|Expl)\b\s*[.:\-–]?\s*(.*)$/i;
const RE_CHAPTER = /^\s*(chapter|unit|part|module|lesson)\s*[-–:. ]*(?:no\.?\s*)?(\d+|[IVXLC]+)?\s*[-–:. ]*\s*(.*)$/i;
const RE_MD = /^(#{1,4})\s+(.+)$/;
const RE_QNUM = /^\s*(?:Q\s*[.:)\-]?\s*)?(\d{1,3})\s*[.)\]:]\s*(.*)$/i;

/* Split a line like "(a) 420 (b) 480 (c) 500 (d) 460" into 4 options.
   Only fires when the FIRST marker sits at the line start (kills false hits). */
function findMarker(t, from, ch) {
  for (let i = from; i < t.length - 1; i++) {
    if (t[i] !== ch && t[i] !== ch.toUpperCase()) continue;
    const prevOk = i === from || /[\s(\[>]/.test(t[i - 1]);
    if (!prevOk) continue;
    let j = i + 1;
    const delims = ')(].:-';
    if (delims.includes(t[j])) {
      let end = j + 1;
      while (end < t.length && /\s/.test(t[end])) end++;
      return { start: i, end };
    }
  }
  return null;
}
function splitOptionsLine(line) {
  const t = line.trim();
  if (!t || t.length < 8) return null;
  for (const alpha of [true, false]) {
    const first = alpha ? 'a' : '1';
    const firstM = findMarker(t, 0, first);
    if (!firstM || !(firstM.start === 0 || (firstM.start === 1 && /[\(\[<]/.test(t[0])))) continue;
    const positions = [];
    let from = 0;
    for (let n = 0; n < 4; n++) {
      const ch = alpha ? 'abcd'[n] : '1234'[n];
      const m = findMarker(t, from, ch);
      if (!m) break;
      positions.push(m.end);
      from = m.end;
    }
    if (positions.length >= 2) {
      const bounds = [...positions, t.length];
      const opts = [];
      for (let i = 0; i < positions.length; i++) {
        const seg = t.slice(bounds[i], bounds[i + 1]).trim().replace(/[\s.;,]+$/, '');
        if (seg) opts.push(seg);
      }
      if (opts.length >= 2) return opts;
    }
  }
  return null;
}

function optionMarkersAhead(line) {
  const inline = splitOptionsLine(line);
  if (inline) return inline.length;
  return RE_OPTION.test(line.trim()) ? 1 : 0;
}

const letterIdx = (ch) => {
  if (!ch) return -1;
  const c = ch.toLowerCase();
  if (c >= 'a' && c <= 'd') return c.charCodeAt(0) - 97;
  if (c >= '1' && c <= '4') return c.charCodeAt(0) - 49;
  return -1;
};

function looksLikeHeading(line) {
  const t = line.trim();
  if (!t || t.length > 90) return false;
  if (RE_MD.test(t)) return true;
  if (RE_CHAPTER.test(t) && t.replace(RE_CHAPTER, '$3').trim().length > 1) return true;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 4 && letters === letters.toUpperCase() && !/[?:]/.test(t)) return true;
  return false;
}

function cleanTitle(t) { return t.replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim(); }

/* Exam-reference detection — captured ONLY when the guide states it. */
function detectExamRef(block) {
  const text = block;
  const rrb = text.match(/\b(RRB|Railway(s)?|RRC)\b[^.\n]{0,60}?\b((?:19|20)\d{2})\b/i) ||
              text.match(/\b((?:19|20)\d{2})\b[^.\n]{0,40}?\b(RRB|Railway(s)?|ALP|NTPC|Group\s*D)\b/i) ||
              text.match(/\b(RRB\s*(?:ALP|NTPC|Tech(?:nician)?|JE|Group\s*[DGC])|Railway\s*Exam)\b/i);
  if (rrb) return { kind: 'RRB', claim: rrb[0].trim() };
  const other = text.match(/\b(SSC(?:\s*(?:CGL|CHSL|MTS|GD))?|IBPS|SBI\s*PO?|Bank\s*(?:PO|Clerk)?|UPSC|CAT|MAT|TNPSC)\b[^.\n]{0,50}?\b((?:19|20)\d{2})\b/i) ||
                text.match(/\b(SSC|IBPS|UPSC|TNPSC)\b/i);
  if (other) return { kind: 'OTHER', claim: other[0].trim() };
  return null;
}

/* ---------------- 1+2: structure + questions ---------------- */
export function parseGuide(rawText, meta = {}) {
  const lines = String(rawText).split(/\r?\n/);
  const sections = [];
  let cur = null;
  let chapterName = meta.title || 'Guide content';
  let autoIdx = 0;

  const startSection = (title) => {
    cur = { chapter: chapterName, title: title || `Part ${++autoIdx}`, lines: [] };
    sections.push(cur);
  };
  startSection(chapterName);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const md = line.match(RE_MD);
    const ch = line.match(RE_CHAPTER);
    const isCapsHead = looksLikeHeading(line) && !md && !ch;
    if (md || ch || isCapsHead) {
      const title = cleanTitle(md ? md[2] : ch ? (ch[3] || ch[0]) : line);
      if (ch || (md && md[1].length <= 2) || (isCapsHead && title.length >= 4)) {
        chapterName = title; startSection(title);
      } else {
        startSection(title);
      }
      continue;
    }
    cur.lines.push(line);
  }

  /* extract questions per section */
  let totalQ = 0, withAns = 0, examRefs = 0;
  for (const sec of sections) {
    const { questions, cleanLines, formulas } = extractQuestions(sec.lines);
    sec.questions = questions;
    sec.formulas = formulas;
    sec.text = cleanLines.join('\n').trim();
    totalQ += questions.length;
    withAns += questions.filter(q => q.answerAvailable).length;
    examRefs += questions.filter(q => q.examRef).length;
  }

  /* 4: mapping guess per section */
  for (const sec of sections) {
    const guess = matchSyllabusTopic(`${sec.chapter} ${sec.title}`.trim());
    if (guess.topicId) {
      sec.guessTopicId = guess.topicId;
      sec.guessSubjectId = TOPIC_BY_ID[guess.topicId].subjectId;
      sec.guessKind = 'IN SYLLABUS';
    } else {
      const bucket = matchGuideExtraBucket(`${sec.chapter} ${sec.title}`);
      sec.guessExtra = bucket;
      sec.guessKind = bucket !== 'x-misc' ? 'GUIDE EXTRA' : 'UNMAPPED';
    }
  }

  const parsed = {
    id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: meta.title || deriveTitle(rawText),
    fileName: meta.fileName || null,
    importedAt: new Date().toISOString(),
    verified: false,
    sections: sections.filter(s => s.text || s.questions.length),
    stats: { totalQ, withAns, examRefs, sectionCount: sections.length },
  };
  return parsed;
}

function deriveTitle(text) {
  const first = text.split(/\r?\n/).map(l => l.trim()).find(l => l.length > 3 && l.length < 80);
  return cap(first || 'Imported guide', 60);
}

function isLikelyQuestionStart(trimmed, lines, idx) {
  if (!trimmed || RE_ANS.test(trimmed) || RE_SOL.test(trimmed)) return false;
  if (RE_OPTION.test(trimmed) || splitOptionsLine(trimmed)) return false;
  const qnum = trimmed.match(RE_QNUM);
  const core = qnum ? qnum[2] : trimmed;
  if (!core || core.length > 420 || trimmed.length > 460) return false;
  const hasQ = /\?/.test(core);
  let optAhead = 0;
  for (let j = idx + 1; j <= Math.min(idx + 5, lines.length - 1); j++) {
    const t = lines[j].trim();
    if (!t) continue;
    const m = optionMarkersAhead(t);
    if (m > 0) optAhead += m;
    else if (optAhead === 0) break;
  }
  const startsQ = /^[Qq]\s*[.:)\-]?\s*\d{0,3}\s*[.:)\-]/.test(trimmed);
  return hasQ || ((optAhead >= 2 || startsQ) && core.length < 330);
}

function extractQuestions(lines) {
  const questions = [];
  const cleanLines = [];
  const formulas = [];
  let i = 0;
  const takeFormula = (line) => {
    const t = line.trim();
    if (t.includes('=') && t.length < 140 && !RE_OPTION.test(t) && !/[?]/.test(t)) formulas.push(t);
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { cleanLines.push(line); i++; continue; }
    if (RE_ANS.test(trimmed) || RE_SOL.test(trimmed)) { i++; continue; } // stray markers

    if (!isLikelyQuestionStart(trimmed, lines, i)) {
      cleanLines.push(line); takeFormula(line); i++; continue;
    }

    /* collect question text (strip leading question number) */
    const qnum = trimmed.match(RE_QNUM);
    const qLines = [qnum ? qnum[2] : trimmed];
    let j = i + 1;
    while (j < lines.length) {
      const t = lines[j].trim();
      if (!t) { break; }
      if (RE_OPTION.test(t) || RE_ANS.test(t) || RE_SOL.test(t) || splitOptionsLine(t)) break;
      if (isLikelyQuestionStart(t, lines, j)) break;
      qLines.push(t);
      j++;
    }

    /* options */
    const options = [];
    let k = j;
    while (k < lines.length && options.length < 4) {
      const t = lines[k].trim();
      const inline = splitOptionsLine(t);
      if (inline) {
        for (const o of inline) if (options.length < 4) options.push(o);
        k++;
        continue;
      }
      const om = t.match(RE_OPTION);
      if (om && letterIdx(om[1]) >= 0 && letterIdx(om[1]) <= 3) {
        options.push(om[2].trim()); k++;
      } else if (!t && options.length >= 1) { k++; continue; }
      else if (t && options.length >= 1 && !RE_ANS.test(t) && !RE_SOL.test(t) && options[options.length - 1].length < 20) {
        options[options.length - 1] += ' ' + t; k++; // wrapped option line
      }
      else break;
    }

    /* answer */
    let answerIdx = -1, answerText = '';
    while (k < lines.length) {
      const t = lines[k].trim();
      const am = t.match(RE_ANS);
      if (am) {
        const rest = am[1].trim();
        const m1 = rest.match(/^[\(\[]?([a-dA-D1-4])[\)\].:\-]/);
        const m2 = rest.match(/^[\(\[]?([a-dA-D1-4])[\)\].]?\s*$/);
        if (m1 || m2) answerIdx = letterIdx((m1 || m2)[1]);
        else answerText = cap(rest, 120);
        k++;
        continue;
      }
      if (!t) { if (k - j > 8) break; k++; continue; }
      break;
    }

    /* solution */
    let solution = '';
    if (k < lines.length && RE_SOL.test(lines[k].trim())) {
      const sm = lines[k].trim().match(RE_SOL);
      const parts = [sm[1]].filter(Boolean);
      k++;
      while (k < lines.length) {
        const t = lines[k].trim();
        if (!t) { if (parts.join(' ').length > 40) break; k++; continue; }
        if (RE_ANS.test(t) || RE_OPTION.test(t) || splitOptionsLine(t) || looksLikeHeading(t)) break;
        if (isLikelyQuestionStart(t, lines, k)) break;
        parts.push(t); k++;
        if (parts.join(' ').length > 1600) break;
      }
      solution = parts.join(' ').trim();
    }

    const text = qLines.join(' ').replace(/\s+/g, ' ').trim();
    const answerAvailable = answerIdx >= 0 && options.length >= 3;
    const ok = text.length >= 8 && (options.length >= 3 || answerIdx >= 0 || answerText);
    if (ok) {
      const examRef = detectExamRef(text + ' ' + solution + ' ' + answerText);
      questions.push({
        text: cap(text, 700),
        options: options.slice(0, 4),
        answer: answerIdx,
        answerText,
        answerAvailable,
        solution: solution ? cap(solution, 1600) : '',
        examRef,
      });
      i = k; continue;
    }
    // not a question after all — keep line as content
    cleanLines.push(line); takeFormula(line); i++;
  }
  return { questions, cleanLines, formulas: formulas.slice(0, 12) };
}

/* ---------------- 5: finalize after review ----------------
   mappings: { [sectionIndex]: { topicId: string|null, extra: bucketId|null, include: bool } } */
export function finalizeGuide(parsed, mappings = {}) {
  const guide = {
    id: parsed.id, title: parsed.title, fileName: parsed.fileName,
    importedAt: parsed.importedAt, verified: false,
    sections: [], questions: [],
  };
  const questions = [];
  parsed.sections.forEach((sec, si) => {
    const m = mappings[si] || {};
    const include = m.include !== false;
    let topicId = ('topicId' in m) ? m.topicId : (sec.guessTopicId || null);
    let extraBucket = null;
    if ('extra' in m && m.extra) { extraBucket = m.extra; topicId = null; }
    else if (!topicId && sec.guessExtra) extraBucket = sec.guessExtra;
    const inSyllabus = !!topicId;
    const sectionId = `g:${guide.id}:${si}`;
    guide.sections.push({
      id: sectionId, index: si, chapter: sec.chapter, title: sec.title,
      text: sec.text, formulas: sec.formulas || [],
      topicId, inSyllabus, extraBucket, include, questionCount: sec.questions.length,
    });
    if (!include) return;
    sec.questions.forEach((q, qi) => {
      const id = `g:${guide.id}:${si}:${qi}`;
      const gq = {
        id, guideId: guide.id, sectionId, guideRef: `${sec.chapter} → ${sec.title}`,
        subjectId: topicId ? TOPIC_BY_ID[topicId].subjectId : null,
        topicId, subtopicId: null, conceptId: null, methodId: null,
        extra: !inSyllabus,
        qtype: 'guide', difficulty: 2,
        source: q.examRef && q.examRef.kind === 'RRB' ? 'PYQ' : 'GUIDE',
        sourceRef: q.examRef ? `Per guide: “${q.examRef.claim}” (guide-claimed, not independently verified)` : 'From uploaded guide',
        text: q.text, options: q.options, answer: q.answer,
        answerAvailable: q.answerAvailable,
        solution: q.solution ? q.solution.split(/(?<=[.;])\s+/).slice(0, 8) : [],
        explanation: q.solution || null,
        guideClaim: q.examRef ? q.examRef.claim : null,
        guideVerified: false,
      };
      if (gq.options.length === 2 || gq.options.length === 3) { // pad to 4 with placeholder-free honest empties? No — keep only 3+ valid; quizzes handle 2-3 options
        gq.options = q.options;
      }
      questions.push(gq);
    });
  });
  guide.questions = questions;
  S.state.guides[guide.id] = guide;
  Bank.addGuideQuestions(questions);
  S.save();
  return guide;
}

export function setGuideQuestionAnswer(guideId, questionId, answerIdx) {
  const g = S.state.guides[guideId];
  if (!g) return;
  const q = g.questions.find(x => x.id === questionId);
  if (!q) return;
  q.answer = answerIdx;
  q.answerAvailable = answerIdx >= 0 && q.options.length >= 2;
  S.save();
}

export function removeGuide(guideId) {
  delete S.state.guides[guideId];
  Bank.removeGuideQuestions(guideId);
  S.save();
}

export function markGuideVerified(guideId, val) {
  const g = S.state.guides[guideId];
  if (!g) return;
  g.verified = !!val;
  for (const q of g.questions) q.guideVerified = !!val;
  S.save();
}

/* On boot: re-register guide questions from persisted state into the bank. */
export function rehydrateGuides() {
  for (const g of Object.values(S.state.guides)) {
    Bank.addGuideQuestions(g.questions || []);
  }
}

/* ---------------- file readers ---------------- */
export async function readFileAsGuide(file) {
  const name = file.name || 'pasted';
  const lower = name.toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    const html = await file.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style').forEach(e => e.remove());
    const text = doc.body ? doc.body.innerText || doc.body.textContent : '';
    return { text, meta: { fileName: name, title: cap(doc.title || name, 60) } };
  }
  if (lower.endsWith('.json')) {
    const data = JSON.parse(await file.text());
    if (data && data.type === 'rrb-guide' && Array.isArray(data.sections)) {
      return { prebuilt: data, meta: { fileName: name, title: data.title || name } };
    }
    throw new Error('JSON must be a previously exported guide file ({"type":"rrb-guide"...}).');
  }
  if (lower.endsWith('.pdf')) {
    const text = await extractPdfText(file);
    return { text, meta: { fileName: name } };
  }
  const text = await file.text();
  return { text, meta: { fileName: name } };
}

/* pdf.js loaded lazily from CDN; needs internet once. If offline → clear error. */
let pdfjsPromise = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!pdfjsPromise) {
    pdfjsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
      s.onload = () => {
        try {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
          resolve(window.pdfjsLib);
        } catch (e) { reject(e); }
      };
      s.onerror = () => { pdfjsPromise = null; reject(new Error('Could not load the PDF reader (needs internet). Please paste the guide text instead.')); };
      document.head.appendChild(s);
    });
  }
  return pdfjsPromise;
}

export async function extractPdfText(file) {
  const pdfjs = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const out = [];
  const max = Math.min(pdf.numPages, 400);
  for (let p = 1; p <= max; p++) {
    const page = await pdf.getPage(p);
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

export function exportGuideJSON(guideId) {
  const g = S.state.guides[guideId];
  if (!g) return null;
  return JSON.stringify({ type: 'rrb-guide', ...g }, null, 1);
}
