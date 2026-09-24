/* ============================================================
   STARTER PACK REGISTRY
   Registers all honestly-labeled starter content (concepts, methods,
   questions, generators) into the Bank. Guide-imported content is added
   on top of this at runtime by guides/importer.js.
   ============================================================ */
import { Bank } from '../store.js';
import { math1Concepts, math1Methods, math1Questions } from './math1.js';
import { math2Concepts, math2Methods, math2Questions } from './math2.js';
import { mathGenerators } from './mathgen.js';
import { reasoningConcepts, reasoningQuestions } from './reasoning.js';
import { reasoningGenerators } from './reasgen.js';
import { scienceConcepts, scienceQuestions } from './science.js';
import { gkConcepts, gkQuestions } from './gk.js';

export function registerStarterContent() {
  const concepts = [...math1Concepts, ...math2Concepts, ...reasoningConcepts, ...scienceConcepts, ...gkConcepts];
  const methods = [...math1Methods, ...math2Methods];
  const questions = [...math1Questions, ...math2Questions, ...reasoningQuestions, ...scienceQuestions, ...gkQuestions];
  const generators = [...mathGenerators, ...reasoningGenerators];

  let dup = 0;
  for (const c of concepts) {
    if (Bank.concepts.has(c.id)) { dup++; console.warn('duplicate concept id', c.id); continue; }
    Bank.registerConcept(c);
  }
  for (const m of methods) Bank.registerMethod(m);
  for (const q of questions) {
    if (!q.options || q.options.length < 2 || q.answer == null || q.answer < 0) {
      console.warn('bad question', q.id); continue;
    }
    Bank.registerQuestion(q);
  }
  for (const g of generators) Bank.registerGenerator(g);

  /* sanity: static questions referenced by concepts must exist */
  for (const c of concepts) {
    for (const qid of (c.practice?.static || [])) {
      if (!Bank.questions.has(qid)) console.warn('concept', c.id, 'references missing question', qid);
    }
  }
  return { concepts: concepts.length, methods: methods.length, questions: questions.length, generators: generators.length, duplicates: dup };
}

export const STARTER_STATS = () => ({
  concepts: Bank.concepts.size,
  methods: Bank.methods.size,
  questions: Bank.questions.size,
  generators: Bank.generators.size,
});
