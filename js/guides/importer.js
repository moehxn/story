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
/* word must stand alone — never match “Part” inside “Participants” or
   “unit” inside “unit’s place”; the title part must be a real title */
const RE_CHAPTER = /^\s*(chapter|unit|part|module|lesson)(?![a-zA-Z'’])\s*[-–:. ]*(?:no\.?\s*)?((?:\d+|[IVXLC]+)?)(?![a-zA-Z])\s*[-–:. ]*\s*(.*)$/i;
const RE_MD = /^(#{1,4})\s+(.+)$/;
const RE_QNUM = /^\s*(?:Q\s*[.:)\-]?\s*)?(\d{1,4})\s*[.)\]:\-]\s*(.*)$/i;
const RE_ANSWER_KEY = /^\s*answer\s*(?:key|s)?\s*[-:.;,–\s]*$/i;

/* Exam-source reference lines printed under questions in real PYQ books:
   "RRB NTPC 25/01/2021 (Evening)", "RPF S.I. 19/12/2018 (Morning)",
   "RRB ALP Tier - 1", "RRB Group-D 20-09-2018(Shift-II)" ...
   These are captured as guide-claimed exam references — never invented. */
const RE_EXAMREF_LINE = new RegExp(
  '^\\s*(?:RRB|RRC|RPF|SSC|UPSC|IBPS|SBI|CISF|DRDO|ISRO|ITI|NTPC|ALP|JE|CHSL|CGL|MTS|Group\\s*[A-E0-9]+|RPF\\s*Constable|Delhi\\s*Police|UP\\s*Police|IB\\s*ACIO|FSSAI|Coast\\s*Guard)' +
  '(?![a-zA-Z])' +
  '([^?]{0,55}?)' +
  '(?:\\b\\d{1,2}\\s*[/\\-.]\\s*\\d{1,2}\\s*[/\\-.]\\s*\\d{2,4}|\\(\\s*(?:Morning|Evening|Afternoon|Shift[^)]{0,15})\\s*\\)|\\b(?:CBT|Tier|Stage|Phase)\\b)' +
  '\\s*$', 'i');
const RE_EXAMREF_DATE_ONLY = /^\s*[\(\[]?\s*\d{1,2}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{2,4}\s*(?:\s*(?:to|–|-)\s*\d{1,2}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{2,4})?\s*[\)\]]?\s*$/;
const RE_EXAMREF_SHORT = /^\s*(?:RRB|RRC|RPF|SSC|UPSC|IBPS|CISF)\s*(?:NTPC|ALP|JE|Group\s*[A-E0-9]+|S\.?I\.?|Tech(?:nician)?|Paramedical|Ministerial)?\s*(?:CBT|Tier|Stage|Phase)?\s*[-–]?\s*\d{0,2}\s*$/i;

function isExamRefLine(line) {
  const t = (line || '').trim();
  if (!t || t.length > 70 || /\?/.test(t)) return false;
  return RE_EXAMREF_LINE.test(t) || RE_EXAMREF_SHORT.test(t);
}
/* "(09/08/2018 to 31/08/2018)" — continuation of a two-line exam reference */
function isExamRefContinuation(line) { return RE_EXAMREF_DATE_ONLY.test((line || '').trim()); }

/* Running page headers used as chapter markers by real guide books:
   "PinnacleDay: 1st - 7thNumber System" → chapter "Number System" */
const RE_DAY_HEADER = /^\s*(?:[A-Za-z&.\s]{2,20}?)?\s*Day\s*:\s*\d{1,3}(?:st|nd|rd|th)?\s*[-–]\s*\d{1,3}(?:st|nd|rd|th)?\s*(.*)$/i;
function dayHeaderTopic(line) {
  const m = (line || '').trim().match(RE_DAY_HEADER);
  if (!m) return null;
  const topic = (m[1] || '').trim();
  return topic.length >= 3 && topic.length <= 60 ? topic : null;
}

/* Answer-key pair grids: "61.(b)62.(c)63.(c)64.(b)" → {61:1, 62:2, ...} */
function parseAnswerKeyLine(line) {
  const pairs = {};
  const re = /(\d{1,4})\s*[.:)\-–]?\s*[\(\[]?\s*([a-dA-D])\s*[\)\]]?/g;
  let m, n = 0;
  while ((m = re.exec(line))) {
    const num = +m[1];
    const idx = m[2].toLowerCase().charCodeAt(0) - 97;
    if (num >= 1 && num <= 9999 && idx >= 0 && idx <= 3) { pairs[num] = idx; n++; }
  }
  /* accept single-pair lines ("1.(c)") only when the whole line is short —
     longer single matches are usually ordinary text with a number and letter */
  return (n >= 2 || (n >= 1 && line.trim().length <= 14)) ? pairs : null;
}

/* Split an options line into up to 4 options.
   Handles the formats found in real guide books, including options glued
   together without spaces: "(a) 84(b) 86(c) 12(d) 74".
   Only fires when the FIRST marker sits at the line start (kills false hits). */
function splitOptionsLine(line) {
  const t = line.trim();
  if (!t || t.length < 6) return null;

  /* "(a) … (b) …" style — tolerates missing spaces; continuation lines may
     start at any marker, e.g. "(c) 100000(d) 895592" */
  const mm = t.match(/^[\(\[]?\s*([a-dA-D])\s*[\)\].:,–-]/);
  if (mm) {
    const first = mm[1].toLowerCase();
    const rest = 'abcd'.slice('abcd'.indexOf(first) + 1); // only markers after the first
    if (rest) {
      const re = new RegExp('(?=[(\\[]\\s*[' + rest + ']\\s*[\\)\\].:,–-])', 'i');
      const parts = t.split(re);
      const opts = parts.map(x => x.replace(/^[\(\[]?\s*[a-d]\s*[\)\].:,–-]\s*/i, '').replace(/[\s.;,]+$/, '').trim()).filter(Boolean);
      if (opts.length >= 1 && parts.length >= 2) return opts.slice(0, 4);
    }
  }
  /* 1) … 2) … numeric markers */
  if (/^[\(\[]?\s*1\s*[\)\].:,–-]/.test(t)) {
    const parts = t.split(/(?=[(\[]?\s*[234]\s*[\)\].:,–-])/);
    if (parts.length >= 2) {
      const opts = parts.map(x => x.replace(/^[\(\[]?\s*[1-4]\s*[\)\].:,–-]\s*/, '').replace(/[\s.;,]+$/, '').trim()).filter(Boolean);
      if (opts.length >= 2) return opts.slice(0, 4);
    }
  }
  /* a) … b) … bare letters with closing paren */
  if (/^a\s*\)/i.test(t)) {
    const parts = t.split(/(?=\b[bcd]\s*\))/i);
    if (parts.length >= 2) {
      const opts = parts.map(x => x.replace(/^[a-d]\s*\)\s*/i, '').replace(/[\s.;,]+$/, '').trim()).filter(Boolean);
      if (opts.length >= 2) return opts.slice(0, 4);
    }
  }
  return null;
}

function optionMarkersAhead(line) {
  const inline = splitOptionsLine(line);
  if (inline) return inline.length;
  return RE_OPTION.test(line.trim()) ? 1 : 0;
}

/* Strict "this line STARTS a new question" test — used to decide when the
   current question's text/solution ends. A mere "?" is NOT enough: multi-line
   questions often continue with "...which of the following is correct?". */
function looksLikeNewQuestion(t, lines, idx) {
  const trimmed = (t || '').trim();
  if (!trimmed) return false;
  if (/^[Qq]\s*[.:)\-]?\s*\d{0,4}\s*[.:)\-]/.test(trimmed)) return true;
  if (isExamRefLine(trimmed) || isExamRefContinuation(trimmed)) return false;
  const qnum = trimmed.match(RE_QNUM);
  const core = qnum ? qnum[2] : trimmed;
  if (!core || core.replace(/[^A-Za-z0-9]/g, '').length < 6) return false;
  let optAhead = 0;
  for (let j = idx + 1; j <= Math.min(idx + 5, lines.length - 1); j++) {
    const tt = lines[j].trim();
    if (!tt) continue;
    const m = optionMarkersAhead(tt);
    if (m > 0) optAhead += m;
    else if (optAhead === 0) break;
  }
  return optAhead >= 2;
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
  const cm = t.match(RE_CHAPTER);
  if (cm && (((cm[3] || '').replace(/[^A-Za-z]/g, '').length >= 3) || cm[2])) return true;
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

  /* Books with "Day: 1st - 7thTopic" running headers use those headers as
     the authoritative chapter structure; stray ALL-CAPS lines (exam names,
     question fragments) must not split chapters. */
  const dayMode = lines.filter(l => dayHeaderTopic(l) !== null).length >= 3;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    /* running page headers ("PinnacleDay: 1st - 7thNumber System") mark the
       current chapter; repeated identical headers are skipped entirely */
    const dayTopic = dayHeaderTopic(line);
    if (dayTopic !== null || /Day\s*:\s*\d/i.test(line)) {
      if (dayTopic && dayTopic !== chapterName) { chapterName = dayTopic; startSection(dayTopic); }
      continue;
    }
    const md = dayMode ? null : line.match(RE_MD);
    /* a chapter heading needs a NUMBER (“Chapter 1: …”) or an ALL-CAPS
       keyword (“CHAPTER 3 — Light”) — never “unit each are melted…” */
    let ch = null;
    if (!dayMode) {
      const chRaw = line.match(RE_CHAPTER);
      if (chRaw) {
        const keyword = (line.trim().match(/^(chapter|unit|part|module|lesson)/i) || [''])[0];
        const capsKeyword = keyword === keyword.toUpperCase() && /[A-Z]/.test(keyword);
        const hasTitle = ((chRaw[3] || '').replace(/[^A-Za-z]/g, '').length >= 3);
        if ((chRaw[2] || capsKeyword) && (hasTitle || chRaw[2])) ch = chRaw;
      }
    }
    let isCapsHead = looksLikeHeading(line) && !md && !ch;
    /* exam-name lines are never headings ("RRB NTPC CBT - 2", "RRB JE") */
    if (isCapsHead && isExamRefLine(line)) isCapsHead = false;
    /* lines dominated by digits/math are question fragments, not headings */
    if (isCapsHead) {
      const letters = line.replace(/[^A-Za-z]/g, '').length;
      const digits = line.replace(/[^0-9]/g, '').length;
      if (line.includes('=') || digits > letters * 0.6) isCapsHead = false;
    }
    if (dayMode) { isCapsHead = false; } // Day-headers define the chapters
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
    const { questions, cleanLines, formulas, answerKey } = extractQuestions(sec.lines);
    sec.questions = questions;
    sec.formulas = formulas;
    sec.answerKey = answerKey;
    sec.text = cleanLines.join('\n').trim();
    totalQ += questions.length;
    withAns += questions.filter(q => q.answerAvailable).length;
    examRefs += questions.filter(q => q.examRef).length;
  }
  /* an all-caps "ANSWER KEY" heading may open its own section — merge its
     pairs into the previous section so they reach that section's questions */
  for (let i = 1; i < sections.length; i++) {
    const sec = sections[i];
    const keyish = sec.questions.length === 0 && Object.keys(sec.answerKey || {}).length >= 2 &&
      sec.text.replace(/[^\d]/g, '').length > sec.text.replace(/[\d\s]/g, '').length;
    if (keyish) {
      const prev = sections[i - 1];
      Object.assign(prev.answerKey = prev.answerKey || {}, sec.answerKey);
      sec.answerKey = {};
      sec.text = '';
    }
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
  if (isExamRefLine(trimmed) || isExamRefContinuation(trimmed)) return false;
  if (RE_OPTION.test(trimmed) || splitOptionsLine(trimmed)) return false;
  const qnum = trimmed.match(RE_QNUM);
  const core = qnum ? qnum[2] : trimmed;
  if (!core || core.length > 420 || trimmed.length > 460) return false;
  if (core.replace(/[^A-Za-z0-9]/g, '').length < 4) return false; // "?"/punct only
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
  const answerKey = {};
  let i = 0;
  let inAnswerKey = false;
  let pendingQnum = null;
  const takeFormula = (line) => {
    const t = line.trim();
    if (t.includes('=') && t.length < 140 && !RE_OPTION.test(t) && !/[?]/.test(t)) formulas.push(t);
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { cleanLines.push(line); i++; continue; }
    /* answer-key blocks: "Answer Key :-" then grids like "61.(b)62.(c)…"
       (checked BEFORE the generic Ans-marker skip, which also matches it) */
    if (RE_ANSWER_KEY.test(trimmed)) { inAnswerKey = true; i++; continue; }
    if (RE_ANS.test(trimmed) || RE_SOL.test(trimmed)) { i++; continue; } // stray markers
    if (inAnswerKey) {
      const pairs = parseAnswerKeyLine(trimmed);
      if (pairs) { Object.assign(answerKey, pairs); i++; continue; }
      if (!/^\s*[\(\[]?[\d\s.()\[\],;:–-]*$/.test(trimmed)) inAnswerKey = false; // key ended
    }

    /* a bare "Q.172." on its own line labels the question that follows */
    if (/^Q?\.?\s*\d{1,4}\s*[.:)\-]\s*$/i.test(trimmed)) { pendingQnum = +(trimmed.match(/\d{1,4}/)[0]); i++; continue; }

    if (!isLikelyQuestionStart(trimmed, lines, i)) {
      cleanLines.push(line); takeFormula(line); i++; continue;
    }

    /* collect question text (strip leading question number) */
    const qnum = trimmed.match(RE_QNUM);
    const qLines = [qnum ? qnum[2] : trimmed];
    let examRef = null;
    let j = i + 1;
    while (j < lines.length) {
      const t = lines[j].trim();
      if (!t) { break; }
      if (RE_OPTION.test(t) || RE_ANS.test(t) || RE_SOL.test(t) || splitOptionsLine(t)) break;
      /* exam-source reference lines under the question are captured, not split */
      if (isExamRefLine(t)) { examRef = (examRef ? examRef + ' ' : '') + t; j++; continue; }
      if (isExamRefContinuation(t) && examRef) { examRef += ' ' + t; j++; continue; }
      if (looksLikeNewQuestion(t, lines, j)) break;
      qLines.push(t);
      j++;
    }

    /* options */
    const options = [];
    let k = j;
    while (k < lines.length && options.length < 4) {
      const t = lines[k].trim();
      if (isExamRefLine(t) || (isExamRefContinuation(t) && examRef)) { k++; continue; }
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
      else if (t && options.length >= 1 && !RE_ANS.test(t) && !RE_SOL.test(t) && !isExamRefLine(t) && !RE_ANSWER_KEY.test(t)
               && !looksLikeNewQuestion(t, lines, k) && options[options.length - 1].length < 20) {
        options[options.length - 1] += ' ' + t; k++; // wrapped option line
      }
      else break;
    }

    /* answer */
    let answerIdx = -1, answerText = '';
    while (k < lines.length) {
      const t = lines[k].trim();
      if (RE_ANSWER_KEY.test(t)) break; // answer-key heading ends this question
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
      if (isExamRefLine(t)) { if (!examRef) examRef = t; k++; continue; }
      if (isExamRefContinuation(t) && examRef) { examRef += ' ' + t; k++; continue; }
      if (!t) { if (k - j > 8) break; k++; continue; }
      break;
    }
    const lineExamRef = examRef ? { kind: 'RRB', claim: examRef.replace(/\s+/g, ' ').trim() } : null;

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
        if (looksLikeNewQuestion(t, lines, k)) break;
        parts.push(t); k++;
        if (parts.join(' ').length > 1600) break;
      }
      solution = parts.join(' ').trim();
    }

    const text = qLines.join(' ').replace(/\s+/g, ' ').trim();
    const answerAvailable = answerIdx >= 0 && options.length >= 3;
    const ok = text.length >= 8 && (options.length >= 3 || answerIdx >= 0 || answerText);
    if (ok) {
      const examRef = lineExamRef || detectExamRef(text + ' ' + solution + ' ' + answerText);
      questions.push({
        text: cap(text, 700),
        options: options.slice(0, 4),
        answer: answerIdx,
        answerText,
        answerAvailable,
        solution: solution ? cap(solution, 1600) : '',
        examRef,
        qnum: qnum ? +qnum[1] : (pendingQnum != null ? pendingQnum : null),
      });
      pendingQnum = null;
      i = k; continue;
    }
    // not a question after all — keep line as content
    cleanLines.push(line); takeFormula(line); i++;
  }
  return { questions, cleanLines, formulas: formulas.slice(0, 12), answerKey };
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
    const answerKey = sec.answerKey || {};
    sec.questions.forEach((q, qi) => {
      const id = `g:${guide.id}:${si}:${qi}`;
      /* apply the guide's own answer key when the inline answer was missing */
      if (q.answer == null || q.answer < 0) {
        if (q.qnum != null && answerKey[q.qnum] !== undefined && answerKey[q.qnum] < (q.options || []).length) {
          q.answer = answerKey[q.qnum];
          q.answerAvailable = q.options.length >= 3;
        }
      }
      const gq = {
        id, guideId: guide.id, sectionId, guideRef: `${sec.chapter} → ${sec.title}`,
        subjectId: topicId ? TOPIC_BY_ID[topicId].subjectId : null,
        topicId, subtopicId: null, conceptId: null, methodId: null,
        extra: !inSyllabus,
        qtype: 'guide', difficulty: 2,
        source: q.examRef && q.examRef.kind === 'RRB' ? 'PYQ' : 'GUIDE',
        sourceRef: q.examRef ? `Per guide: “${q.examRef.claim}” (guide-claimed, not independently verified)` : 'From uploaded guide',
        text: q.text, options: q.options, answer: q.answer,
        qnum: q.qnum ?? null,
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

/* ---------- runtime guide layer (large/disk-backed guides) ----------
   Guides too big for localStorage are stored as LIGHT STUBS in state
   (sections metadata + counts + user overrides) while the full content
   lives in a runtime registry fed from data/guides/*.json (bundled sync)
   or an in-session live sync. All user actions below work on both.  */

const runtimeGuides = new Map(); // guideId -> full guide object (not persisted)

export function registerRuntimeGuide(guide) {
  runtimeGuides.set(guide.id, guide);
  Bank.addGuideQuestions(guide.questions || []);
  return guide;
}

export function getGuideFull(guideId) {
  const g = S.state.guides[guideId];
  if (g && !g.stub) return g;
  return runtimeGuides.get(guideId) || null;
}

export function isRuntimeGuideLoaded(guideId) { return runtimeGuides.has(guideId); }

/* Apply user overrides (answers, section mapping, verified) onto a freshly
   loaded full guide, then register it. */
export function applyGuideOverrides(guide) {
  const stub = S.state.guides[guide.id];
  if (!stub) return guide;
  if (stub.verified) { guide.verified = true; for (const q of guide.questions || []) q.guideVerified = true; }
  const ansOv = stub.answerOverrides || {};
  for (const q of guide.questions || []) {
    if (ansOv[q.id] !== undefined) { // the user's own answer always wins
      q.answer = ansOv[q.id];
      q.answerAvailable = q.answer >= 0 && (q.options || []).length >= 2;
      q.userAnswered = true;
    }
  }
  const mapOv = stub.mapOverrides || {};
  for (const sec of guide.sections || []) {
    const ov = mapOv[sec.id];
    if (ov) {
      if (ov.topicId) { sec.topicId = ov.topicId; sec.inSyllabus = true; sec.extraBucket = null; }
      else if (ov.extra) { sec.extraBucket = ov.extra; sec.topicId = null; sec.inSyllabus = false; }
      for (const q of guide.questions || []) if (q.sectionId === sec.id) {
        q.topicId = sec.topicId;
        q.subjectId = sec.topicId ? (TOPIC_BY_ID[sec.topicId] || {}).subjectId || null : null;
        q.extra = !sec.inSyllabus;
      }
    }
  }
  return guide;
}

export function setGuideQuestionAnswer(guideId, questionId, answerIdx) {
  const g = S.state.guides[guideId];
  if (!g) return;
  if (g.stub) {
    g.answerOverrides = g.answerOverrides || {};
    const already = g.answerOverrides[questionId] !== undefined;
    g.answerOverrides[questionId] = answerIdx;
    if (!already && g.qNoAns > 0 && answerIdx >= 0) g.qNoAns--;
    const full = runtimeGuides.get(guideId);
    const q = full && full.questions.find(x => x.id === questionId);
    if (q) { q.answer = answerIdx; q.answerAvailable = answerIdx >= 0 && q.options.length >= 2; q.userAnswered = true; }
    S.save();
    return;
  }
  const q = g.questions.find(x => x.id === questionId);
  if (!q) return;
  q.answer = answerIdx;
  q.answerAvailable = answerIdx >= 0 && q.options.length >= 2;
  S.save();
}

export function removeGuide(guideId) {
  delete S.state.guides[guideId];
  runtimeGuides.delete(guideId);
  Bank.removeGuideQuestions(guideId);
  S.save();
}

export function markGuideVerified(guideId, val) {
  const g = S.state.guides[guideId];
  if (!g) return;
  g.verified = !!val;
  const full = g.stub ? runtimeGuides.get(guideId) : g;
  if (full) for (const q of full.questions || []) q.guideVerified = !!val;
  S.save();
}

/* On boot: re-register guide questions from persisted state into the bank.
   Stub (disk-backed) guides are re-loaded from their bundled files by
   js/guides/github.js → bootBundledGuides(). */
export function rehydrateGuides() {
  for (const g of Object.values(S.state.guides)) {
    if (g.stub) continue;
    Bank.addGuideQuestions(g.questions || []);
  }
}

/* Remap a section to a different syllabus topic / guide-extra bucket.
   Works for full guides and stubs (override store). */
export function remapGuideSection(guideId, sectionId, mapping) {
  const g = S.state.guides[guideId];
  if (!g) return false;
  const full = g.stub ? runtimeGuides.get(guideId) : g;
  const apply = (sec) => {
    if (mapping.topicId) { sec.topicId = mapping.topicId; sec.inSyllabus = true; sec.extraBucket = null; }
    else if (mapping.extra) { sec.extraBucket = mapping.extra; sec.topicId = null; sec.inSyllabus = false; }
  };
  if (g.stub) {
    const sec = g.sections.find(x => x.id === sectionId);
    if (!sec) return false;
    apply(sec);
    g.mapOverrides = g.mapOverrides || {};
    g.mapOverrides[sectionId] = mapping;
  } else {
    const sec = g.sections.find(x => x.id === sectionId);
    if (!sec) return false;
    apply(sec);
  }
  if (full) {
    const sec = full.sections.find(x => x.id === sectionId);
    if (sec) {
      apply(sec);
      for (const q of full.questions || []) if (q.sectionId === sec.id) {
        q.topicId = sec.topicId;
        q.subjectId = sec.topicId ? (TOPIC_BY_ID[sec.topicId] || {}).subjectId || null : null;
        q.extra = !sec.inSyllabus;
      }
    }
  }
  S.save();
  return true;
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
