import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import {validateEnglish} from './validate-act-passages.mjs';
const raw=fs.readFileSync('docs/english-passages-final.md','utf8');
const blocks=[...raw.matchAll(/^# PASSAGE (\d+) — (.+)$/gm)];
if(blocks.length!==5)throw Error('Expected five passage headings');
const items=blocks.map((heading,index)=>{
 const body=raw.slice(heading.index+heading[0].length,index+1<blocks.length?blocks[index+1].index:raw.length);
 const split=body.indexOf('### Questions');
 if(split<0)throw Error('Missing questions for '+heading[2]);
 const passage=body.slice(0,split).trim();
 const questionsText=body.slice(split+'### Questions'.length);
 const qMatches=[...questionsText.matchAll(/^\*\*(\d+)\.\*\* \(([^\n]+)\)([^\n]*)/gm)];
 if(qMatches.length!==10)throw Error('Expected ten questions for '+heading[2]+': '+qMatches.length);
 const questions=qMatches.map((m,i)=>{
  const chunk=questionsText.slice(m.index+m[0].length,i+1<qMatches.length?qMatches[i+1].index:questionsText.length);
  const choices={};
  for(const match of chunk.matchAll(/^- ([ABCD])\. (.*)$/gm))choices[match[1]]=match[2];
  const answer=chunk.match(/^\*\*Answer: ([ABCD])\*\*/m)?.[1];
  const explanationByChoice={};
  for(const match of chunk.matchAll(/^- ([ABCD]): (.*)$/gm))explanationByChoice[match[1]]=match[2];
  const [difficulty,...skillParts]=m[2].split(' · ');
  const intro=chunk.slice(0,chunk.search(/^- A\. /m)).trim();
  const prompt=(m[3].trim()+'\n'+intro).trim() || ('Choose the best answer for question '+m[1]+'.');
  const type=/sentence placement/i.test(skillParts.join(' '))||/most logically be placed|should be placed/i.test(prompt)?'placement':/writer.s goal/i.test(skillParts.join(' '))?'goal':/add a sentence|delete a sentence/i.test(skillParts.join(' '))?'add_delete':'editing';
  return {number:Number(m[1]),difficulty,skill:skillParts.join(' · '),prompt,choices,answer,explanationByChoice,type,originalCorrect:type==='editing'&&answer==='A'};
 });
 return {title:heading[2],passage,questions,aiReview:{verdict:'pending',summary:'Exact owner-provided final draft, pending owner approval.'},sourceDocument:'docs/english-passages-final.md'};
});
console.log('Validated:',validateEnglish(items));
if(process.argv.includes('--write-review')){
 fs.writeFileSync('docs/english-passages-review.json',JSON.stringify(items,null,2)+'\n');
 console.log('Wrote exact source-derived JSON review');
}
if(process.argv.includes('--update-reserve')){
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL missing');
 const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
 try{
  await db.query('BEGIN');
  let count=0;
  for(const item of items){
   for(const q of item.questions){
    const fingerprint=crypto.createHash('sha256').update('mock-longpassage-v1:'+item.title+':'+q.number).digest('hex');
    const result=await db.query(`update questions q set prompt=$1, passage=$2, choices=$3, correct_answer=$4, explanation=$5, difficulty=$6, review_notes=$7 where q.fingerprint=$8 and q.status='draft' and q.usage_scope='mock_reserve' and not exists(select 1 from mock_test_form_questions f where f.question_id=q.id) returning q.id`,[q.prompt,item.passage,JSON.stringify(q.choices),q.answer,Object.entries(q.explanationByChoice).map(([c,x])=>c+': '+x).join(' | '),q.difficulty,JSON.stringify({passageTitle:item.title,skill:q.skill,ownerReview:'pending',sourceDocument:item.sourceDocument,type:q.type}),fingerprint]);
    if(result.rowCount!==1)throw Error('Refusing update of missing/assigned reserve draft '+item.title+' Q'+q.number);
    count++;
   }
  }
  await db.query('COMMIT');console.log('Updated '+count+' mock-reserve drafts, zero form changes');
 }catch(e){await db.query('ROLLBACK');throw e}finally{await db.end()}
}
