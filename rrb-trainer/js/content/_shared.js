/* ============================================================
   Content builders shared by all Starter Pack files.
   IMPORTANT (spec §5, §36): everything in the Starter Pack is honestly
   labeled EXPECTED PRACTICE (curated from the official syllabus pattern)
   or AI-GENERATED PRACTICE (runtime variants). It is NEVER labeled
   GUIDE / PYQ / OFFICIAL, and it never invents exam years or sources.
   ============================================================ */
export const STARTER_REF = 'Starter Pack — built from the official RRB Tech-III syllabus pattern. Not from any uploaded guide or exam paper.';

/* teach-block shorthands */
export const h   = (x) => ({ t: 'h', x });
export const p   = (x) => ({ t: 'p', x });
export const li  = (x) => ({ t: 'list', x });
export const F   = (x, vars, note) => ({ t: 'formula', x, vars: vars || [], note });
export const NR  = (x) => ({ t: 'norule', x });
export const E   = (x, steps, answer) => ({ t: 'example', x, steps: steps || [], answer });
export const T   = (head, rows) => ({ t: 'table', head, rows });
export const trap= (x) => ({ t: 'trap', x });
export const mem = (tech, x) => ({ t: 'memory', tech, x });
export const rec = (x) => ({ t: 'recall', x });
export const st  = (x) => ({ t: 'steps', x });
export const note= (x) => ({ t: 'note', x });
export const sub = (subjectId) => ({
  concept: (id, topicId, title, summary, blocks, guided, staticQIds, extra = {}) =>
    ({ id, subjectId, topicId, title, summary, blocks, guided, practice: { static: staticQIds || [], generators: extra.generators || [] }, source: 'EXPECTED', sourceRef: STARTER_REF, ...extra }),
  method: (id, topicId, name, idea, formula, recognize, example) =>
    ({ id, subjectId, topicId, name, idea, formula, recognize, example, source: 'EXPECTED', sourceRef: STARTER_REF }),
  q: (id, topicId, o) =>
    ({ id, subjectId, topicId, source: 'EXPECTED', sourceRef: STARTER_REF, qtype: 'practice', difficulty: 2, answerAvailable: true, ...o }),
});
export const shuffleText = null;
