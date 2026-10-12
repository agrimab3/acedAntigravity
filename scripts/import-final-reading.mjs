import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import {validateReading} from './validate-act-passages.mjs';

const raw=fs.readFileSync('docs/reading-passages-final.md','utf8');
const headings=[...raw.matchAll(/^# PASSAGE (I|II|III|IV) — (.+)$/gm)];
if(headings.length!==4)throw Error('Expected four Reading passage headings');
const items=headings.map((heading,index)=>{
 const block=raw.slice(heading.index+heading[0].length,index+1<headings.length?headings[index+1].index:raw.length);
 const intro=block.match(/^\*([^\n]+)\*/m)?.[1];
 const passage=block.match(/\x60\x60\x60\n([\s\S]*?)\n\x60\x60\x60/)?.[1];
 if(!intro||!passage)throw Error('Missing introduction or line-numbered passage '+heading[1]);
 const questionsText=block.slice(block.indexOf('### Questions')+'### Questions'.length);
 const matches=[...questionsText.matchAll(/^\*\*(\d+)\.\*\* \(([^\n]+)\)/gm)];
 if(matches.length!==9)throw Error('Expected nine questions '+heading[1]);
 const questions=matches.map((match,i)=>{
  const chunk=questionsText.slice(match.index+match[0].length,i+1<matches.length?matches[i+1].index:questionsText.length);
  const choices={};for(const m of chunk.matchAll(/^- ([ABCD])\. (.*)$/gm))choices[m[1]]=m[2];
  const explanationByChoice={};for(const m of chunk.matchAll(/^- ([ABCD]): (.*)$/gm))explanationByChoice[m[1]]=m[2];
  const answer=chunk.match(/^\*\*Answer: ([ABCD])\*\*/m)?.[1];
  const [difficulty,...skill]=match[2].split(' · ');
  const prompt=chunk.slice(0,chunk.search(/^- A\. /m)).trim();
  return {number:Number(match[1]),difficulty,skill:skill.join(' · '),prompt,choices,answer,explanationByChoice};
 });
 return {title:heading[2],intro,passage,questions,sourceDocument:'docs/reading-passages-final.md'};
});
console.log('Validated:',validateReading(items));
if(process.argv.includes('--write-review')){fs.writeFileSync('docs/reading-passages-review.json',JSON.stringify(items,null,2)+'\n');console.log('Wrote exact-source Reading JSON');}
if(process.argv.includes('--insert-reserve')){
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL missing');
 const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
 try{
  await db.query('BEGIN');
  const topics=(await db.query("select id from act_topics where section_key='reading' and is_active=true order by display_order limit 1")).rows;
  if(!topics.length)throw Error('No active Reading topic');
  let count=0;
  for(const item of items){
   const group='reading-final:'+crypto.createHash('sha256').update(item.title).digest('hex').slice(0,24);
   for(const q of item.questions){
    const fp=crypto.createHash('sha256').update('mock-reading-final-v1:'+item.title+':'+q.number).digest('hex');
    const params=[crypto.randomUUID(),topics[0].id,q.difficulty,q.prompt,item.passage,JSON.stringify(q.choices),q.answer,Object.entries(q.explanationByChoice).map(([c,x])=>c+': '+x).join(' | '),group,fp,JSON.stringify({passageTitle:item.title,intro:item.intro,skill:q.skill,sourceDocument:item.sourceDocument})];
    const result=await db.query(`insert into questions (id,section_key,topic_id,difficulty,question_type,prompt,passage,choices,correct_answer,explanation,source,status,fingerprint,usage_scope,review_notes) values ($1,'reading',$2,$3,'multiple_choice',$4,$5,$6,$7,$8,$9,'draft',$10,'mock_reserve',$11) on conflict (fingerprint) do update set prompt=excluded.prompt,passage=excluded.passage,choices=excluded.choices,correct_answer=excluded.correct_answer,explanation=excluded.explanation,difficulty=excluded.difficulty,review_notes=excluded.review_notes where questions.status='draft' and questions.usage_scope='mock_reserve' and not exists(select 1 from mock_test_form_questions f where f.question_id=questions.id) returning id`,params);
    if(result.rowCount!==1)throw Error('Reserve insert/update blocked: '+item.title+' Q'+q.number);
    count++;
   }
  }
  await db.query('COMMIT');console.log('Saved '+count+' Reading mock-reserve drafts; no form assignments');
 }catch(e){await db.query('ROLLBACK');throw e}finally{await db.end()}
}
