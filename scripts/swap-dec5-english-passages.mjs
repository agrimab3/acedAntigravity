import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';

const path='docs/dec5-reviewed-form.json';
const payload=JSON.parse(fs.readFileSync(path,'utf8'));
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL missing');
const canonical=rows=>rows.map(r=>({section:r.section_key,position:r.position,question:r.id,prompt:r.prompt,passage:r.passage,choices:r.choices,answer:r.correct_answer,explanation:r.explanation,set:r.question_set_id}));
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const byId=new Map(payload.questions.map(q=>[q.id,q]));
const current=payload.order.filter(o=>o.section_key==='english').map(o=>({...byId.get(o.question_id),position:o.position}));
if(current.length!==50)throw Error('Invalid English form');
await client.connect();
try{
 const {rows:candidates}=await client.query(`select q.* from questions q where q.section_key='english' and q.difficulty='medium' and q.status='published' and q.usage_scope='practice' and q.question_set_id is null and q.passage is not null and not exists(select 1 from mock_test_form_questions fq where fq.question_id=q.id) order by q.id`);
 const used=new Set(payload.questions.map(q=>q.fingerprint).filter(Boolean));
 const chosen=[];
 const easy=current.filter(q=>q.difficulty==='easy');
 for(const old of easy){
  const matches=candidates.filter(q=>!chosen.some(c=>c.new.id===q.id)&&q.topic_id===old.topic_id&&q.fingerprint&&!used.has(q.fingerprint)&&!current.some(x=>x.passage===q.passage));
  if(!matches.length)continue;
  const next=matches[0];
  chosen.push({old,new:next});used.add(next.fingerprint);
  if(chosen.length===8)break;
 }
 if(chosen.length!==8)throw Error(`Only ${chosen.length} topic-matched whole-passage replacements found; aborting`);
 const keys=['id','section_key','topic_id','difficulty','question_type','prompt','passage','choices','correct_answer','explanation','source','status','created_at','updated_at','fingerprint','generation_model','review_notes','reviewed_at','reviewed_by_user_id','question_set_id','usage_scope'];
 for(const {old,new:replacement} of chosen){
  const id=crypto.randomUUID();
  const q=Object.fromEntries(keys.map(k=>[k,replacement[k]??null]));
  q.id=id;q.usage_scope='mock_reserve';q.fingerprint=null;
  q.review_notes=`Dec 5 Form A: whole-passage replacement of English position ${old.position}; source bank question ${replacement.id}. Original practice question retained.`;
  payload.questions=payload.questions.filter(x=>x.id!==old.id);
  payload.questions.push(q);
  payload.order.find(o=>o.section_key==='english'&&o.position===old.position).question_id=id;
 }
 const orderMap=new Map(payload.questions.map(q=>[q.id,q]));
 const ordered=payload.order.map(o=>({...orderMap.get(o.question_id),position:o.position}));
 payload.checksum=digest(canonical(ordered));
 fs.writeFileSync(path,JSON.stringify(payload,null,2)+'\n');
 const counts=Object.fromEntries(['easy','medium','hard'].map(d=>[d,ordered.filter(q=>q.section_key==='english'&&q.difficulty===d).length]));
 console.log(JSON.stringify({replacedPositions:chosen.map(x=>x.old.position),counts,checksum:payload.checksum}));
}finally{await client.end()}
