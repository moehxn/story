/* ============================================================
   OFFICIAL SYLLABUS — RRB Technician Grade III CBT
   Source: user-provided official syllabus/portion.
   Subject-wise distribution is INDICATIVE (shown, not hard-coded
   as a promise of any actual paper).
   ============================================================ */

export const EXAM = {
  name: 'RRB Technician Grade III CBT',
  totalQuestions: 100,
  totalMarks: 100,
  minutes: 90,            // default exam-mode timer (adjustable in settings)
  negative: 1 / 3,        // default negative marking (adjustable)
  note: 'The subject-wise distribution below is indicative. Actual papers may differ.',
};

export const SUBJECTS = [
  { id: 'MATH',      name: 'Mathematics',                  short: 'Maths',     questions: 25, marks: 25, color: 'var(--math)',      hex: '#1d4ed8', icon: '∑' },
  { id: 'REASONING', name: 'General Intelligence & Reasoning', short: 'Reasoning', questions: 25, marks: 25, color: 'var(--reasoning)', hex: '#6d28d9', icon: '⇄' },
  { id: 'SCIENCE',   name: 'General Science',              short: 'Science',   questions: 40, marks: 40, color: 'var(--science)',   hex: '#047857', icon: '⚛' },
  { id: 'GA',        name: 'General Awareness',            short: 'GA',        questions: 10, marks: 10, color: 'var(--ga)',        hex: '#b45309', icon: '🌐' },
];

export const SUBJECT_BY_ID = Object.fromEntries(SUBJECTS.map(s => [s.id, s]));

/* Topics = official syllabus entries only. keywords[] are synonyms used
   ONLY to map uploaded guide chapters onto the official syllabus. */
export const TOPICS = [
  // ---------------- MATHEMATICS ----------------
  { id: 'number-system',   subjectId: 'MATH', name: 'Number System',
    keywords: ['number system','numbers','natural number','whole number','integer','rational number','real number','divisibility','prime number','factors','factor','multiples','remainder','digits','place value','even odd','prime','composite'] },
  { id: 'bodmas',          subjectId: 'MATH', name: 'BODMAS',
    keywords: ['bodmas','order of operations','brackets','simplification','simplify'] },
  { id: 'decimals',        subjectId: 'MATH', name: 'Decimals',
    keywords: ['decimal','decimals','decimal fraction'] },
  { id: 'fractions',       subjectId: 'MATH', name: 'Fractions',
    keywords: ['fraction','fractions','proper fraction','improper fraction','mixed number','like fractions','numerator','denominator'] },
  { id: 'lcm',             subjectId: 'MATH', name: 'LCM',
    keywords: ['lcm','least common multiple','lowest common multiple','lowest common multiple (lcm)','together ring'] },
  { id: 'hcf',             subjectId: 'MATH', name: 'HCF',
    keywords: ['hcf','highest common factor','gcd','greatest common divisor','greatest common measure'] },
  { id: 'ratio-proportion',subjectId: 'MATH', name: 'Ratio and Proportion',
    keywords: ['ratio','proportion','ratios','ratio and proportion','ratio & proportion','proportional'] },
  { id: 'percentages',     subjectId: 'MATH', name: 'Percentages',
    keywords: ['percentage','percent','%','per cent','percentage change'] },
  { id: 'mensuration',     subjectId: 'MATH', name: 'Mensuration',
    keywords: ['mensuration','area','perimeter','volume','surface area','circle','triangle area','square area','rectangle','cube','cuboid','cylinder'] },
  { id: 'time-work',       subjectId: 'MATH', name: 'Time and Work',
    keywords: ['time and work','work and time','work','days work','labour','men days'] },
  { id: 'time-distance',   subjectId: 'MATH', name: 'Time and Distance',
    keywords: ['time and distance','time distance','speed','time speed distance','distance','kmph','relative speed','average speed','train'] },
  { id: 'simple-interest', subjectId: 'MATH', name: 'Simple Interest',
    keywords: ['simple interest','si','interest','principal'] },
  { id: 'compound-interest',subjectId: 'MATH', name: 'Compound Interest',
    keywords: ['compound interest','ci','compounded'] },
  { id: 'profit-loss',     subjectId: 'MATH', name: 'Profit and Loss',
    keywords: ['profit and loss','profit & loss','profit','loss','p&l','cost price','selling price','cp sp','discount','marked price'] },
  { id: 'algebra',         subjectId: 'MATH', name: 'Algebra',
    keywords: ['algebra','equation','linear equation','quadratic','identities','polynomial','variable','algebraic'] },
  { id: 'geometry',        subjectId: 'MATH', name: 'Geometry',
    keywords: ['geometry','angle','angles','triangle','circle geometry','line','parallel lines','congruence','similar triangles','quadrilateral','parallelogram'] },
  { id: 'trigonometry',    subjectId: 'MATH', name: 'Trigonometry',
    keywords: ['trigonometry','trigonometric','sin','cos','tan','sine','cosine','tangent','heights and distances','trig'] },
  { id: 'statistics',      subjectId: 'MATH', name: 'Elementary Statistics',
    keywords: ['statistics','mean','median','mode','average','range','data','elementary statistics','central tendency','frequency'] },
  { id: 'square-root',     subjectId: 'MATH', name: 'Square Root',
    keywords: ['square root','square','sqrt','cube root','perfect square','roots'] },
  { id: 'age-calculations',subjectId: 'MATH', name: 'Age Calculations',
    keywords: ['age','ages','age problems','age calculation','present age'] },
  { id: 'calendar-clock',  subjectId: 'MATH', name: 'Calendar and Clock',
    keywords: ['calendar','clock','odd days','leap year','day of week','clock angle','calendar and clock'] },
  { id: 'pipes-cistern',   subjectId: 'MATH', name: 'Pipes and Cistern',
    keywords: ['pipes and cistern','pipe','cistern','tank','fill empty','leak'] },

  // ---------------- GENERAL INTELLIGENCE & REASONING ----------------
  { id: 'analogies',        subjectId: 'REASONING', name: 'Analogies',
    keywords: ['analogy','analogies','is to as to','similar pair'] },
  { id: 'alphabetical-series', subjectId: 'REASONING', name: 'Alphabetical Series',
    keywords: ['alphabetical series','letter series','alphabet series','alphabet test','missing letter','letters'] },
  { id: 'number-series',    subjectId: 'REASONING', name: 'Number Series',
    keywords: ['number series','series completion','missing number','wrong number','sequence'] },
  { id: 'coding-decoding',  subjectId: 'REASONING', name: 'Coding and Decoding',
    keywords: ['coding','decoding','code','coded','cipher'] },
  { id: 'mathematical-operations', subjectId: 'REASONING', name: 'Mathematical Operations',
    keywords: ['mathematical operations','symbol operations','interchange of signs','operation'] },
  { id: 'relationships',    subjectId: 'REASONING', name: 'Relationships',
    keywords: ['relationship','blood relation','family tree','family relationship','relations'] },
  { id: 'syllogism',        subjectId: 'REASONING', name: 'Syllogism',
    keywords: ['syllogism','syllogisms','statements and conclusions','all some','deduction'] },
  { id: 'jumbling',         subjectId: 'REASONING', name: 'Jumbling',
    keywords: ['jumbling','jumbled','rearrangement','word formation','reorder'] },
  { id: 'venn-diagram',     subjectId: 'REASONING', name: 'Venn Diagram',
    keywords: ['venn','venn diagram','set diagram','region'] },
  { id: 'data-interpretation', subjectId: 'REASONING', name: 'Data Interpretation',
    keywords: ['data interpretation','di','table chart','bar graph','pie chart','graph interpretation'] },
  { id: 'data-sufficiency', subjectId: 'REASONING', name: 'Data Sufficiency',
    keywords: ['data sufficiency','sufficiency','statement sufficient'] },
  { id: 'conclusions-decision', subjectId: 'REASONING', name: 'Conclusions and Decision Making',
    keywords: ['conclusion','decision making','course of action','decision'] },
  { id: 'similarities-differences', subjectId: 'REASONING', name: 'Similarities and Differences',
    keywords: ['similarities','differences','similarity','alike'] },
  { id: 'analytical-reasoning', subjectId: 'REASONING', name: 'Analytical Reasoning',
    keywords: ['analytical reasoning','puzzle','seating arrangement','arrangement','ranking','order','comparison','schedule'] },
  { id: 'classification',   subjectId: 'REASONING', name: 'Classification',
    keywords: ['classification','odd one out','odd one','odd pair','which is different'] },
  { id: 'directions',       subjectId: 'REASONING', name: 'Directions',
    keywords: ['direction','directions','direction sense','north south','left right turn'] },
  { id: 'statement-arguments', subjectId: 'REASONING', name: 'Statement-Arguments',
    keywords: ['statement and argument','arguments','strong argument','weak argument'] },
  { id: 'assumptions',      subjectId: 'REASONING', name: 'Assumptions',
    keywords: ['assumption','assumptions','implicit','statement assumption'] },

  // ---------------- GENERAL SCIENCE (10th standard level) ----------------
  { id: 'physics',     subjectId: 'SCIENCE', name: 'Physics',
    keywords: ['physics','motion','force','laws of motion','newton','velocity','acceleration','work power energy','work energy','gravitation','gravity','pressure','floatation','buoyancy','heat','temperature','light','reflection','refraction','mirror','lens','electricity','current','ohm','magnet','magnetism','sound','wave','unit and measurement','units','measurement'] },
  { id: 'chemistry',   subjectId: 'SCIENCE', name: 'Chemistry',
    keywords: ['chemistry','matter','atom','atoms','molecule','element','compound','mixture','periodic table','periodic','acid','base','salt','acids bases','ph','chemical reaction','chemical bonding','metal','non metal','metals','nonmetals','combustion','fuel','water','solution','colloid','gas','oxidation','reduction','corrosion','rusting'] },
  { id: 'life-sciences', subjectId: 'SCIENCE', name: 'Life Sciences',
    keywords: ['life science','life sciences','biology','botany','zoology','cell','tissue','photosynthesis','respiration','human body','blood','heart','digestive','nervous','brain','excretory','reproduction','plant','hormone','vitamin','vitamins','disease','diseases','protein','genetics','dna','ecology','environment biology','microorganism'] },

  // ---------------- GENERAL AWARENESS ----------------
  { id: 'current-affairs',   subjectId: 'GA', name: 'Current Affairs',
    keywords: ['current affairs','current events','recent','news','last 6 months','monthly current affairs'] },
  { id: 'science-technology',subjectId: 'GA', name: 'Science and Technology',
    keywords: ['science and technology','science & technology','technology','isro','space','nuclear','defence technology','inventions','discoveries'] },
  { id: 'sports',            subjectId: 'GA', name: 'Sports',
    keywords: ['sports','sport','games','olympic','cricket','hockey','football','badminton','athletics','players','sportsperson'] },
  { id: 'culture',           subjectId: 'GA', name: 'Culture',
    keywords: ['culture','art','dance','dances','music','festival','festivals','heritage','architecture','language','literature','painting','culture of india','indian culture'] },
  { id: 'personalities',     subjectId: 'GA', name: 'Personalities',
    keywords: ['personality','personalities','famous persons','leaders','scientists','awards','nobel','bharat ratna','first person'] },
  { id: 'economics',         subjectId: 'GA', name: 'Economics',
    keywords: ['economics','economy','gdp','budget','inflation','banking','rbi','currency','money','finance','five year plan','tax'] },
  { id: 'politics',          subjectId: 'GA', name: 'Politics',
    keywords: ['politics','polity','constitution','parliament','president','prime minister','election','government','amendment','articles','lok sabha','rajya sabha'] },
  { id: 'other-important',   subjectId: 'GA', name: 'Other Important Subjects',
    keywords: ['static gk','general knowledge','gk','geography','history','india','world','books and authors','important days','national symbols','awards and honours','first in india','abbreviations','organisation','organizations','un','united nations'] },
];

export const TOPIC_BY_ID = Object.fromEntries(TOPICS.map(t => [t.id, t]));
export const topicsOf = (subjectId) => TOPICS.filter(t => t.subjectId === subjectId);

/* Extra (non-syllabus) buckets that uploaded guides often contain.
   These are shown under "GUIDE EXTRA" and are NEVER mixed into
   official syllabus progress. */
export const GUIDE_EXTRA_BUCKETS = [
  { id: 'x-computer',    name: 'Computer',       keywords: ['computer','computers','software','hardware','ms office','excel','word','powerpoint','internet','networking','operating system','keyboard shortcut','input output device','it'] },
  { id: 'x-environment', name: 'Environment',    keywords: ['environment','environmental','ecology','ecosystem','pollution','global warming','biodiversity','conservation','climate change','ozone'] },
  { id: 'x-misc',        name: 'Miscellaneous',  keywords: [] },
];

/* ---------------- SOURCE LABELS (strict rules) ----------------
   GUIDE                = directly based on uploaded guide material
   VERIFIED RRB/PYQ     = exam source info ACTUALLY available (e.g. guide itself
                          attributes the question to an RRB exam); claim shown, not invented
   OFFICIAL/VERIFIED    = verified official source (user-marked)
   EXPECTED PRACTICE    = practice created based on syllabus patterns
   AI-GENERATED PRACTICE= generated by AI at runtime (variants)          */
export const SOURCES = {
  GUIDE:         { label: 'GUIDE',                  cls: 'src-GUIDE',    desc: 'Directly from an uploaded guide.' },
  PYQ:           { label: 'VERIFIED RRB/PYQ',       cls: 'src-PYQ',      desc: 'Exam reference actually stated in the source material. The claim is shown — never invented by this app.' },
  OFFICIAL:      { label: 'OFFICIAL/VERIFIED',      cls: 'src-OFFICIAL', desc: 'Marked verified by you from an official source.' },
  EXPECTED:      { label: 'EXPECTED PRACTICE',      cls: 'src-EXPECTED', desc: 'Practice based on official syllabus patterns (Starter Pack).' },
  AI:            { label: 'AI-GENERATED PRACTICE',  cls: 'src-AI',       desc: 'Generated by the app as a fresh variant. Never a real exam question.' },
};
export const SOURCE_ORDER = ['GUIDE', 'PYQ', 'OFFICIAL', 'EXPECTED', 'AI'];

/* ---------- syllabus matching for guide import ---------- */
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9&%\s]/g, ' ').replace(/\s+/g, ' ').trim();

export function matchSyllabusTopic(name) {
  const n = norm(name);
  if (!n) return { topicId: null, score: 0 };
  let best = null, bestScore = 0;
  for (const t of TOPICS) {
    let score = 0;
    const tn = norm(t.name);
    if (n === tn || n === norm(t.id)) score = 100;
    else {
      if (n.includes(tn) || tn.includes(n)) score = Math.max(score, 70 + tn.length);
      for (const k of t.keywords) {
        if (n === k) score = Math.max(score, 88 + k.length);
        else if (n.includes(k) || (k.length > 4 && k.includes(n))) score = Math.max(score, 50 + k.length);
      }
    }
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return bestScore >= 55 ? { topicId: best.id, score: bestScore } : { topicId: null, score: bestScore };
}

export function matchGuideExtraBucket(name) {
  const n = norm(name);
  if (!n) return 'x-misc';
  let best = 'x-misc', bestScore = 0;
  for (const b of GUIDE_EXTRA_BUCKETS) {
    for (const k of b.keywords) {
      if (n.includes(k)) { const s = 50 + k.length; if (s > bestScore) { bestScore = s; best = b.id; } }
    }
  }
  return best;
}
