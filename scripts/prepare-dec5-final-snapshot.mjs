// Prepares a reviewed Form A snapshot. Does not change production; import is a separate guarded step.
import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import {validateEnglish,validateReading} from './validate-act-passages.mjs';

const snapshotPath='docs/dec5-reviewed-form.json';
const payload=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
const english=JSON.parse(fs.readFileSync('docs/english-passages-review.json','utf8'));
const reading=JSON.parse(fs.readFileSync('docs/reading-passages-review.json','utf8'));
validateEnglish(english);validateReading(reading);
if(payload.checksum!=='6bdab1e8bd8e672191d74a2522729156d8c9531ce75bddddfb31c7a88b1f8940')throw Error('Unexpected old checksum');
const canonical=rows=>rows.map(r=>({section:r.section_key,position:r.position,question:r.id,prompt:r.prompt,passage:r.passage,choices:r.choices,answer:r.correct_answer,explanation:r.explanation,set:r.question_set_id}));
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const map=new Map(payload.questions.map(q=>[q.id,q]));
const original=payload.order.map(o=>({...map.get(o.question_id),position:o.position}));
if(digest(canonical(original))!==payload.checksum)throw Error('Original snapshot mismatch');
const stable=section=>payload.order.filter(o=>o.section_key===section).map(o=>[o.position,o.question_id]);
const before={math:stable('math'),science:stable('science')};
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
try{
 const counts=(await db.query(`select
 (select count(*)::int from mock_registrations r join mock_tests t on t.id=r.mock_test_id where t.slug='2026-12-05') registrations,
 (select count(*)::int from mock_test_sessions s join mock_registrations r on r.id=s.registration_id join mock_tests t on t.id=r.mock_test_id where t.slug='2026-12-05') sessions,
 (select count(*)::int from mock_test_section_runs sr join mock_test_sessions s on s.id=sr.session_id join mock_registrations r on r.id=s.registration_id join mock_tests t on t.id=r.mock_test_id where t.slug='2026-12-05') runs`)).rows[0];
 if(Object.values(counts).some(Number))throw Error('STOP: Dec 5 registrations/sessions/runs exist');
 const updates=[];
 for(const [section,passages,tag] of [['english',english,'mock-longpassage-v1:'],['reading',reading,'mock-reading-final-v1:']]){
  let position=0;
  for(const item of passages){
   for(const q of item.questions){
    position++;
    const fingerprint=crypto.createHash('sha256').update(tag+item.title+':'+q.number).digest('hex');
    const {rows}=await db.query('select * from questions where fingerprint=$1 and section_key=$2 and usage_scope=$3 and status=$4',[fingerprint,section,'mock_reserve','draft']);
    if(rows.length!==1)throw Error('Expected one unmodified reserve draft '+section+' '+position+'; got '+rows.length);
    const row=rows[0];
    const explanation=Object.entries(q.explanationByChoice).map(([c,x])=>c+': '+x).join(' | ');
    for(const [name,expected] of [['prompt',q.prompt],['passage',item.passage],['correct_answer',q.answer],['explanation',explanation],['difficulty',q.difficulty]]){
     if(row[name]!==expected)throw Error('Content mismatch '+section+' '+position+' '+name);
    }
    if(JSON.stringify(row.choices)!==JSON.stringify(q.choices))throw Error('Choice mismatch '+section+' '+position);
    const assigned=await db.query('select 1 from mock_test_form_questions where question_id=$1 limit 1',[row.id]);
    if(assigned.rowCount)throw Error('Draft already assigned '+row.id);
    const originalOrder=payload.order.find(o=>o.section_key===section&&o.position===position);
    if(!originalOrder)throw Error('Missing original order '+section+' '+position);
    const newRow={...row,status:'published',usage_scope:'mock_reserve'};
    payload.questions=payload.questions.filter(x=>x.id!==originalOrder.question_id);
    payload.questions.push(newRow);
    originalOrder.question_id=row.id;
    updates.push({section,position,id:row.id,difficulty:row.difficulty});
   }
  }
 }
 if(updates.length!==86)throw Error('Expected 86 replacements');
 if(JSON.stringify(before.math)!==JSON.stringify(stable('math'))||JSON.stringify(before.science)!==JSON.stringify(stable('science')))throw Error('Math/Science changed');
 const byId=new Map(payload.questions.map(q=>[q.id,q]));
 const ordered=payload.order.map(o=>({...byId.get(o.question_id),position:o.position}));
 const total=ordered.length;
 const sectionCounts=Object.fromEntries(['english','math','reading','science'].map(s=>[s,ordered.filter(q=>q.section_key===s).length]));
 const mix=s=>Object.fromEntries(['easy','medium','hard'].map(d=>[d,ordered.filter(q=>q.section_key===s&&q.difficulty===d).length]));
 if(total!==171||JSON.stringify(Object.values(sectionCounts))!==JSON.stringify([50,45,36,40]))throw Error('Section count mismatch');
 if(JSON.stringify(Object.values(mix('english')))!==JSON.stringify([15,25,10]))throw Error('English mix mismatch');
 if(JSON.stringify(Object.values(mix('reading')))!==JSON.stringify([11,18,7]))throw Error('Reading mix mismatch');
 const oldChecksum=payload.checksum;
 payload.checksum=digest(canonical(ordered));
 fs.writeFileSync(snapshotPath,JSON.stringify(payload,null,2)+'\n');
 fs.writeFileSync('docs/dec5-final-swap-audit.json',JSON.stringify({oldChecksum,newChecksum:payload.checksum,counts,sectionCounts,englishDifficulty:mix('english'),readingDifficulty:mix('reading'),mathBefore:before.math,mathAfter:stable('math'),scienceBefore:before.science,scienceAfter:stable('science'),replacements:updates},null,2)+'\n');
 console.log(JSON.stringify({oldChecksum,newChecksum:payload.checksum,counts,sectionCounts,englishDifficulty:mix('english'),readingDifficulty:mix('reading'),mathUnchanged:true,scienceUnchanged:true,replacements:updates.length}));
}finally{await db.end()}
