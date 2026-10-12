import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import {validateScience} from './validate-act-passages.mjs';

const source='docs/science-passages-final.md';
const raw=fs.readFileSync(source,'utf8');
const headings=[...raw.matchAll(/^# PASSAGE (I|II|III|IV|V|VI) — (DATA REPRESENTATION|RESEARCH SUMMARIES|CONFLICTING VIEWPOINTS): (.+)$/gm)];
if(headings.length!==6)throw Error('Expected exactly six Science passages');
const items=headings.map((heading,index)=>{
 const block=raw.slice(heading.index+heading[0].length,index+1<headings.length?headings[index+1].index:raw.length);
 const separator=block.indexOf('### Questions');if(separator<0)throw Error('Missing questions '+heading[1]);
 const passage=block.slice(0,separator).trim();
 const questionsText=block.slice(separator+'### Questions'.length);
 const matches=[...questionsText.matchAll(/^\*\*(\d+)\.\*\* \(([^\n]+)\)/gm)];
 const questions=matches.map((match,i)=>{
  const chunk=questionsText.slice(match.index+match[0].length,i+1<matches.length?matches[i+1].index:questionsText.length).trim();
  const choices={};for(const m of chunk.matchAll(/^- ([ABCD])\. (.*)$/gm))choices[m[1]]=m[2];
  const explanationByChoice={};for(const m of chunk.matchAll(/^- ([ABCD]): (.*)$/gm))explanationByChoice[m[1]]=m[2];
  const answer=chunk.match(/^\*\*Answer: ([ABCD])\*\*/m)?.[1];
  const [difficulty,...skill]=match[2].split(' · ');
  const firstChoice=chunk.search(/^- A\. /m);
  if(firstChoice<0)throw Error('Missing choices Q'+match[1]);
  return {number:Number(match[1]),difficulty,skill:skill.join(' · '),prompt:chunk.slice(0,firstChoice).trim(),choices,answer,explanationByChoice};
 });
 return {roman:heading[1],type:heading[2],title:heading[3],passage,questions,sourceDocument:source};
});
console.log('Validated:',validateScience(items));
if(process.argv.includes('--write-review')){fs.writeFileSync('docs/science-passages-review.json',JSON.stringify(items,null,2)+'\n');console.log('Wrote source-preserving Science JSON');}
if(process.argv.includes('--insert-reserve')){
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL missing');
 const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
 try{
  await db.query('BEGIN');
  const topics=(await db.query("select id,name from act_topics where section_key='science' and is_active=true")).rows;
  const pick=type=>topics.find(t=>type==='DATA REPRESENTATION'?/data representation/i.test(t.name):/research summaries/i.test(t.name))??topics[0];
  if(!topics.length)throw Error('No active Science topic');
  let count=0;
  for(const item of items){
   const topic=pick(item.type);const setId=crypto.randomUUID();
   const setFingerprint=crypto.createHash('sha256').update('mock-science-final-v1:'+item.roman).digest('hex');
   // Keep all 6 passage bodies verbatim, including Markdown tables and captions.
   const existing=(await db.query("select id from question_sets where section_key='science' and metadata->>'sourceFingerprint'=$1",[setFingerprint])).rows[0];
   const id=existing?.id??setId;
   if(existing){const attached=(await db.query('select count(*)::int n from mock_test_form_questions f join questions q on q.id=f.question_id where q.question_set_id=$1',[id])).rows[0].n;if(attached)throw Error('Passage assigned to a form: '+item.title);}
   await db.query(`insert into question_sets (id,section_key,topic_id,kind,title,content,metadata) values ($1,'science',$2,'science_stimulus',$3,$4,$5) on conflict (id) do update set content=excluded.content,metadata=excluded.metadata,title=excluded.title where question_sets.id=$1`,[id,topic.id,item.title,item.passage,JSON.stringify({sourceDocument:source,sourceFingerprint:setFingerprint,passage:item.roman,type:item.type})]);
   for(const q of item.questions){
    const fp=crypto.createHash('sha256').update('mock-science-final-v1:'+item.roman+':'+q.number).digest('hex');
    const notes=JSON.stringify({passageTitle:item.title,passageNumber:item.roman,passageType:item.type,skill:q.skill,sourceDocument:source,questionNumber:q.number,explanationByChoice:q.explanationByChoice});
    const result=await db.query(`insert into questions (id,section_key,topic_id,difficulty,question_type,prompt,passage,choices,correct_answer,explanation,source,status,fingerprint,usage_scope,review_notes,question_set_id) values ($1,'science',$2,$3,'multiple_choice',$4,$5,$6,$7,$8,$9,'draft',$10,'mock_reserve',$11,$12) on conflict (fingerprint) do update set prompt=excluded.prompt,passage=excluded.passage,choices=excluded.choices,correct_answer=excluded.correct_answer,explanation=excluded.explanation,difficulty=excluded.difficulty,review_notes=excluded.review_notes,question_set_id=excluded.question_set_id where questions.status='draft' and questions.usage_scope='mock_reserve' and not exists(select 1 from mock_test_form_questions f where f.question_id=questions.id) returning id`,[crypto.randomUUID(),topic.id,q.difficulty,q.prompt,item.passage,JSON.stringify(q.choices),q.answer,Object.entries(q.explanationByChoice).map(([c,x])=>c+': '+x).join('\n'), 'science-final:'+item.roman,fp,notes,id]);
    if(result.rowCount!==1)throw Error('Reserve insert/update blocked: '+item.title+' Q'+q.number);
    count++;
   }
  }
  await db.query('COMMIT');console.log('Saved '+count+' Science mock_reserve drafts in six passage sets; Form A untouched');
 }catch(e){await db.query('ROLLBACK');throw e}finally{await db.end()}
}
