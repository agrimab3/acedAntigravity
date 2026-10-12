import fs from 'node:fs';

function assert(condition, message) { if (!condition) throw Error(message); }
const normalize = value => String(value).trim().toLowerCase();

export function validateEnglish(items, {singlePassage = false} = {}) {
  assert(items.length === (singlePassage ? 1 : 5), 'Unexpected English passage count');
  let incorrect = 0, editing = 0;
  for (const item of items) {
    assert(item.questions.length === 10, item.title + ': question count');
    const markers = [...item.passage.matchAll(/\[(\d+)\](?:<u>([\s\S]*?)<\/u>)?/g)];
    const underlines = markers.filter(m => m[2] !== undefined);
    assert(underlines.length >= 7 && underlines.length <= 8, item.title + ': underline count');
    assert(item.passage.includes('[Paragraph 1]'), item.title + ': paragraph labels');
    const mix = {easy:0,medium:0,hard:0};
    for (const q of item.questions) {
      assert(q.number >= 1 && q.number <= 10, item.title + ': question number');
      assert(['A','B','C','D'].includes(q.answer), item.title + ' Q'+q.number+': answer');
      assert(['A','B','C','D'].every(c => q.choices?.[c] && q.explanationByChoice?.[c]), item.title + ' Q'+q.number+': options/explanations');
      assert(new Set(Object.values(q.choices).map(normalize)).size === 4, item.title + ' Q'+q.number+': duplicate choices');
      assert(q.difficulty in mix, item.title + ' Q'+q.number+': difficulty');mix[q.difficulty]++;
      if(q.type === 'editing') {
        editing++;
        assert(q.choices.A === 'NO CHANGE', item.title + ' Q'+q.number+': A must be NO CHANGE');
        assert(underlines.some(m=>Number(m[1])===q.number),item.title+' Q'+q.number+': missing underline');
        if(q.answer !== 'A')incorrect++;
      } else {
        assert(q.choices.A !== 'NO CHANGE',item.title+' Q'+q.number+': rhetorical A must not be NO CHANGE');
        if(q.type === 'goal' || q.type === 'add_delete')assert(['A','B','C','D'].every(c=>/^(Yes|No), because /i.test(q.choices[c])),item.title+' Q'+q.number+': Yes/No reasons required');
        if(q.type === 'placement')assert(['A','B','C','D'].every(c=>!/^Yes|^No/i.test(q.choices[c])),item.title+' Q'+q.number+': placement options required');
      }
    }
    assert(mix.easy===3 && mix.medium===5 && mix.hard===2,item.title+': difficulty mix');
    assert(item.questions.some(q=>q.type==='add_delete'||q.type==='placement'),item.title+': missing organization question');
  }
  assert(incorrect >= (singlePassage ? 5 : 25) && incorrect <= (singlePassage ? 7 : 35),'Incorrect editing items: '+incorrect);
  return {passages:items.length,questions:items.length*10,editing,incorrectUnderlines:incorrect};
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
  if (process.argv.includes('--english-only')) { console.log('English:',validateEnglish(english));process.exit(0); }
  const readingPath = 'docs/reading-passages-review.json';
  console.log('English:', validateEnglish(english));
  assert(fs.existsSync(readingPath), 'Reading review file not yet written');
  console.log('Reading:', validateReading(JSON.parse(fs.readFileSync(readingPath, 'utf8'))));
}
