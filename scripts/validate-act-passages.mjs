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
  assert(items.length===4,'Expected four Reading passages');
  let total=0;
  for(const [index,item] of items.entries()){
    assert(item.intro && item.passage && item.questions.length===9,item.title+': intro/passage/questions');
    const lines=item.passage.split('\n');
    const numbered=lines.filter(line=>/^\d{3} (?:¶ |  )/.test(line));
    assert(numbered.length>=45,item.title+': missing line-numbered text');
    for(const [i,line] of numbered.entries())assert(Number(line.slice(0,3))===i+1,item.title+': line numbering error at '+(i+1));
    if(index===3){assert(lines.includes('PASSAGE A')&&lines.includes('PASSAGE B'),item.title+': paired headings missing');assert(lines.indexOf('PASSAGE B')>lines.indexOf('PASSAGE A'),item.title+': paired order');}
    const mix={easy:0,medium:0,hard:0};
    for(const [i,q] of item.questions.entries()){
      assert(q.number===i+1,item.title+': question sequence');
      assert(q.prompt && q.choices && ['A','B','C','D'].every(c=>q.choices[c]&&q.explanationByChoice?.[c]),item.title+' Q'+q.number+': missing prompt/choice/explanation');
      assert(!Object.values(q.choices).some(c=>normalize(c)==='no change'),item.title+' Q'+q.number+': NO CHANGE prohibited');
      assert(new Set(Object.values(q.choices).map(normalize)).size===4,item.title+' Q'+q.number+': duplicate options');
      assert(['A','B','C','D'].includes(q.answer),item.title+' Q'+q.number+': invalid key');
      assert(q.difficulty in mix,item.title+' Q'+q.number+': difficulty');mix[q.difficulty]++;total++;
    }
    assert(mix.easy+mix.medium+mix.hard===9,item.title+': difficulty total');
  }
  return {passages:items.length,questions:total};
}

if (process.argv[1]?.endsWith('validate-act-passages.mjs')) {
  const english = JSON.parse(fs.readFileSync('docs/english-passages-review.json', 'utf8'));
  if (process.argv.includes('--night-garden')) {
    console.log('English passage 1:', validateEnglish([english.find(x => x.title === 'The Night Garden')], {singlePassage:true}));
    process.exit(0);
  }
  if (process.argv.includes('--reading-only')) { console.log('Reading:',validateReading(JSON.parse(fs.readFileSync('docs/reading-passages-review.json','utf8'))));process.exit(0); }
  if (process.argv.includes('--english-only')) { console.log('English:',validateEnglish(english));process.exit(0); }
  const readingPath = 'docs/reading-passages-review.json';
  console.log('English:', validateEnglish(english));
  assert(fs.existsSync(readingPath), 'Reading review file not yet written');
  console.log('Reading:', validateReading(JSON.parse(fs.readFileSync(readingPath, 'utf8'))));
}
