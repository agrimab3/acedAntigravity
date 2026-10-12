import fs from 'node:fs';

function assert(condition, message) { if (!condition) throw Error(message); }
const normalize = value => String(value).trim().toLowerCase();

export function validateEnglish(items, {singlePassage = false} = {}) {
  assert(items.length === (singlePassage ? 1 : 5), 'Unexpected English passage count');
  let incorrect = 0;
  for (const item of items) {
    const words = item.passage.replace(/\[\/?underline\]/g, '').trim().split(/\s+/).length;
    assert(words >= 300 && words <= 400, item.title + ': passage word count');
    const spans = [...item.passage.matchAll(/\[underline\]([\s\S]*?)\[\/underline\]/g)].map(m => m[1]);
    assert(spans.length === 10 && (item.passage.match(/\[underline\]/g) || []).length === 10, item.title + ': underline count');
    assert(item.questions.length === 10, item.title + ': question count');
    const skills = item.questions.map(q => (q.skill + ' ' + q.prompt).toLowerCase());
    assert(skills.some(s => /add.or.delete|add.*delete/.test(s)), item.title + ': missing add/delete');
    assert(skills.some(s => /placement|where.*sentence|sentence.*placed/.test(s)), item.title + ': missing placement');
    assert(skills.some(s => /writer.s goal|writer.s primary goal|suppose the writer/.test(s)), item.title + ': missing writer goal');
    for (let i = 0; i < 10; i++) {
      const q = item.questions[i];
      assert(q.choices.A === 'NO CHANGE', item.title + ' Q' + (i + 1) + ': A must be NO CHANGE');
      assert(['A','B','C','D'].includes(q.answer), 'Invalid key');
      const choices = Object.values(q.choices).map(normalize);
      assert(new Set(choices).size === 4, item.title + ': duplicate choices');
      assert(q.explanationByChoice && ['A','B','C','D'].every(c => q.explanationByChoice[c]), item.title + ': missing explanation for an option');
      assert(q.originalCorrect === (q.answer === 'A'), item.title + ': original correctness and key disagree');
      if (q.answer !== 'A') incorrect++;
      if (q.answer !== 'A') assert(normalize(q.choices[q.answer]) !== normalize(spans[i]), item.title + ': correct choice copies incorrect text');
    }
  }
  assert(incorrect >= (singlePassage ? 6 : 30) && incorrect <= (singlePassage ? 7 : 35), 'Incorrect underline count: ' + incorrect);
  return {passages: items.length, questions: items.length * 10, incorrectUnderlines: incorrect};
}

export function validateReading(items) {
  assert(items.length === 4, 'Expected four Reading passages');
  for (const item of items) {
    const words = item.passage.trim().split(/\s+/).length;
    assert(words >= 700 && words <= 800, item.title + ': expected 700–800 words, got ' + words);
    assert(item.questions.length === 9, item.title + ': expected nine questions');
    assert(item.passage.includes('[1]') && /\[\d+\]/.test(item.passage), item.title + ': missing line numbers');
    const mix = {easy:0, medium:0, hard:0};
    for (const q of item.questions) {
      assert(q.lineReference && /\d/.test(q.lineReference), item.title + ': missing line reference');
      assert(q.choices && ['A','B','C','D'].every(c => q.choices[c]), item.title + ': missing choice');
      assert(new Set(Object.values(q.choices).map(normalize)).size === 4, item.title + ': duplicate choices');
      assert(['A','B','C','D'].includes(q.answer), item.title + ': missing key');
      assert(q.explanationByChoice && ['A','B','C','D'].every(c => q.explanationByChoice[c]), item.title + ': missing distractor rationale');
      assert(q.answerParaphrased === true, item.title + ': correct answer must be independently checked for paraphrase');
      assert(q.difficulty in mix, item.title + ': invalid difficulty');
      mix[q.difficulty]++;
    }
    assert(mix.easy === 3 && mix.medium === 4 && mix.hard === 2, item.title + ': difficulty mix');
  }
  return {passages:4, questions:36};
}

if (process.argv[1]?.endsWith('validate-act-passages.mjs')) {
  const english = JSON.parse(fs.readFileSync('docs/english-passages-review.json', 'utf8'));
  if (process.argv.includes('--night-garden')) {
    console.log('English passage 1:', validateEnglish([english.find(x => x.title === 'The Night Garden')], {singlePassage:true}));
    process.exit(0);
  }
  const readingPath = 'docs/reading-passages-review.json';
  console.log('English:', validateEnglish(english));
  assert(fs.existsSync(readingPath), 'Reading review file not yet written');
  console.log('Reading:', validateReading(JSON.parse(fs.readFileSync(readingPath, 'utf8'))));
}
