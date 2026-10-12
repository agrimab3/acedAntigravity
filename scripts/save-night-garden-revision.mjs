import fs from 'node:fs';
import pg from 'pg';
import crypto from 'node:crypto';
import {nightGarden} from './night-garden-revision.mjs';
import {validateEnglish} from './validate-act-passages.mjs';

validateEnglish([nightGarden], {singlePassage:true});
const path='docs/english-passages-review.json';
const data=JSON.parse(fs.readFileSync(path,'utf8'));
const index=data.findIndex(p=>p.title===nightGarden.title);
if(index<0)throw Error('Existing reserve passage not found');
data[index]={...nightGarden,words:370,model:'human-authored',aiReview:{verdict:'pending',summary:'Rewritten after prior AI review; new content awaits owner review.'}};
fs.writeFileSync(path,JSON.stringify(data,null,2)+'\n');
const md=['# Five English passages — owner review only','','**Passage 1 revised to ACT-style; passages 2–5 remain previous drafts. No Dec 5 form changes.**',''];
for(const item of data){
 md.push('## '+item.title,'','Word count: '+item.words+'. Review: '+(item.aiReview?.verdict||'pending')+'.','',item.passage.replaceAll('[underline]','<u>').replaceAll('[/underline]','</u>'),'');
 for(const q of item.questions){
  md.push('### '+q.number+'. '+q.prompt,'');
  for(const c of 'ABCD')md.push('- '+c+'. '+q.choices[c]);
  md.push('','**Answer: '+q.answer+'** · '+q.difficulty+' · '+q.skill,'');
  if(q.explanationByChoice)for(const c of 'ABCD')md.push('- **'+c+':** '+q.explanationByChoice[c]);
  else md.push('Explanation: '+q.explanation);
  md.push('');
 }
 md.push('---','');
}
fs.writeFileSync('docs/english-passages-review.md',md.join('\n'));

if(process.argv.includes('--update-reserve')){
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL missing');
 const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
 try{
  await db.query('BEGIN');
  const form=await db.query(`select count(*)::int n from mock_test_form_questions f join questions q on q.id=f.question_id where q.source=$1`,['english-longpassage:'+crypto.createHash('sha256').update('english-longpassage:'+nightGarden.title).digest('hex').slice(0,24)]);
  if(form.rows[0].n!==0)throw Error('Refusing to modify questions linked to a mock form');
  for(const q of nightGarden.questions){
   const fp=crypto.createHash('sha256').update('mock-longpassage-v1:'+nightGarden.title+':'+q.number).digest('hex');
   const result=await db.query(`update questions set prompt=$1, passage=$2, choices=$3, correct_answer=$4, explanation=$5, difficulty=$6, review_notes=$7 where fingerprint=$8 and status='draft' and usage_scope='mock_reserve' returning id`,[q.prompt,nightGarden.passage,JSON.stringify(q.choices),q.answer,Object.entries(q.explanationByChoice).map(([c,x])=>c+': '+x).join(' | '),q.difficulty,JSON.stringify({passageTitle:nightGarden.title,skill:q.skill,ownerReview:'pending',originalCorrect:q.originalCorrect}),fp]);
   if(result.rowCount!==1)throw Error('Expected exactly one existing reserve draft for question '+q.number);
  }
  await db.query('COMMIT');console.log('Updated exactly 10 existing mock-reserve drafts; no form assignments');
 }catch(e){await db.query('ROLLBACK');throw e}finally{await db.end()}
}
console.log('Passage 1 review files updated and validated');
