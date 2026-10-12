import pg from 'pg';
import fs from 'node:fs';
import crypto from 'node:crypto';
const slug='2026-12-05';
const sections={english:50,math:45,reading:36,science:40};
const stable=x=>JSON.stringify(x,Object.keys(x).sort());
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const cols=['id','section_key','topic_id','difficulty','question_type','prompt','passage','choices','correct_answer','explanation','source','status','created_at','updated_at','fingerprint','generation_model','review_notes','reviewed_at','reviewed_by_user_id','question_set_id','usage_scope'];
const setcols=['id','section_key','topic_id','kind','title','content','metadata','created_at','updated_at'];
const args=process.argv.slice(2);const mode=args[0];const path=args[1]||'docs/dec5-reviewed-form.json';
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL missing');
const formQuery=`select fq.section_key,fq.position,q.* from mock_test_form_questions fq join mock_test_forms f on f.id=fq.form_id join mock_tests mt on mt.id=f.mock_test_id join questions q on q.id=fq.question_id where mt.slug=$1 and f.version='A' order by case fq.section_key when 'english' then 1 when 'math' then 2 when 'reading' then 3 else 4 end,fq.position`;
const canonical=rows=>rows.map(r=>({section:r.section_key,position:r.position,question:r.id,prompt:r.prompt,passage:r.passage,choices:r.choices,answer:r.correct_answer,explanation:r.explanation,set:r.question_set_id,topic:r.topic_id}));
const validate=rows=>{if(rows.length!==171)throw Error('Expected 171 rows');for(const [section,n] of Object.entries(sections)){const positions=rows.filter(r=>r.section_key===section).map(r=>r.position);if(JSON.stringify(positions)!==JSON.stringify(Array.from({length:n},(_,i)=>i+1)))throw Error('Invalid positions '+section)}};
const fetchRows=async()=>{const r=await client.query(formQuery,[slug]);validate(r.rows);return r.rows};
try{
 await client.connect();
 if(mode==='export'){
  const rows=await fetchRows();const ids=[...new Set(rows.map(r=>r.question_set_id).filter(Boolean))];const sets=ids.length?(await client.query('select * from question_sets where id=any($1::uuid[])',[ids])).rows:[];
  const topicIds=[...new Set([...rows.map(r=>r.topic_id),...sets.map(s=>s.topic_id)])];const topics=(await client.query('select * from act_topics where id=any($1::uuid[])',[topicIds])).rows;
  const payload={slug,version:'A',questions:rows.map(r=>Object.fromEntries(cols.map(c=>[c,r[c]]))),order:rows.map(r=>({section_key:r.section_key,position:r.position,question_id:r.id})),sets:sets.map(s=>Object.fromEntries(setcols.map(c=>[c,s[c]]))),topics,checksum:digest(canonical(rows))};
  fs.writeFileSync(path,JSON.stringify(payload,null,2));console.log(JSON.stringify({mode,count:rows.length,sets:sets.length,checksum:payload.checksum}));
 }else if(mode==='compare'){
  const payload=JSON.parse(fs.readFileSync(path,'utf8'));const rows=await fetchRows();const localIds=payload.order.map(x=>x.question_id);const remoteIds=rows.map(x=>x.id);const a=new Set(localIds),b=new Set(remoteIds);const differing=rows.filter((r,i)=>r.id!==localIds[i]);const sameIds=localIds.filter(x=>b.has(x)).length;console.log(JSON.stringify({samePosition:171-differing.length,sharedQuestionIds:sameIds,localOnly:171-sameIds,productionOnly:171-sameIds,productionChecksum:digest(canonical(rows)),localChecksum:payload.checksum}));
 }else if(mode==='import'){
  const payload=JSON.parse(fs.readFileSync(path,'utf8'));if(payload.slug!==slug||payload.version!=='A'||payload.order.length!==171||payload.questions.length!==171)throw Error('Invalid reviewed form');
  const local=payload.order.map(o=>({...payload.questions.find(q=>q.id===o.question_id),position:o.position}));validate(local);
  const hash=digest(canonical(local));if(hash!==payload.checksum)throw Error('Payload checksum mismatch');
  await client.query('BEGIN');
  await client.query('select pg_advisory_xact_lock(hashtext($1))',[slug]);
  const test=(await client.query('select * from mock_tests where slug=$1 for update',[slug])).rows[0];if(!test||test.status!=='open')throw Error('Mock test not open');
  const counts=(await client.query(`select (select count(*)::int from mock_registrations where mock_test_id=$1) registrations,(select count(*)::int from mock_test_sessions s join mock_registrations r on r.id=s.registration_id where r.mock_test_id=$1) sessions,(select count(*)::int from mock_test_section_runs sr join mock_test_sessions s on s.id=sr.session_id join mock_registrations r on r.id=s.registration_id where r.mock_test_id=$1) runs`,[test.id])).rows[0];if(Object.values(counts).some(Number))throw Error('ABORT: production registrations or attempts exist');
  const beforeRows=await fetchRows();
  const oldReserve=beforeRows.filter(r=>['english','reading'].includes(r.section_key));
  if(oldReserve.length!==86||oldReserve.some(r=>r.usage_scope!=='mock_reserve'))throw Error('Old English/Reading questions must remain mock_reserve');
  const fixedBefore=beforeRows.filter(r=>['math','science'].includes(r.section_key)).map(r=>[r.section_key,r.position,r.id]);
  const fixedTarget=payload.order.filter(r=>['math','science'].includes(r.section_key)).map(r=>[r.section_key,r.position,r.question_id]);
  if(JSON.stringify(fixedBefore)!==JSON.stringify(fixedTarget))throw Error('ABORT: Math/Science question positions or IDs differ from production');
  if(payload.questions.filter(q=>['english','reading'].includes(q.section_key)).some(q=>q.status!=='published'||q.usage_scope!=='mock_reserve'))throw Error('New English/Reading must be published mock_reserve');
  const form=(await client.query('select * from mock_test_forms where mock_test_id=$1 and version=$2 for update',[test.id,'A'])).rows[0];if(!form||form.status!=='locked')throw Error('Form A not locked');
  for(const topic of payload.topics){const existing=(await client.query('select * from act_topics where id=$1',[topic.id])).rows[0];if(!existing){if(!String(topic.slug).startsWith('dec5-tag-'))throw Error('Missing preexisting topic '+topic.id);await client.query('insert into act_topics (id,section_key,slug,name,display_order,is_active) values ($1,$2,$3,$4,$5,$6)',[topic.id,topic.section_key,topic.slug,topic.name,topic.display_order,topic.is_active])}else if(existing.name!==topic.name||existing.section_key!==topic.section_key)throw Error('Topic metadata collision '+topic.id)}
  const upsert=async(table,columns,obj)=>{const names=columns.map((c,i)=>'"'+c+'"').join(',');const marks=columns.map((_,i)=>'$'+(i+1)).join(',');const changes=columns.filter(c=>c!=='id').map(c=>'"'+c+'"=excluded."'+c+'"').join(',');await client.query(`insert into ${table} (${names}) values (${marks}) on conflict (id) do update set ${changes}`,columns.map(c=>obj[c]??null))};
  await client.query("update mock_test_forms set status='review',locked_at=null,locked_by_user_id=null where id=$1",[form.id]);
  for(const set of payload.sets)await upsert('question_sets',setcols,set);
  const targetIds=payload.questions.map(q=>q.id);
  const fingerprints=payload.questions.map(q=>q.fingerprint).filter(Boolean);
  const collisions=(await client.query('select id from questions where fingerprint=any($1::text[]) and not (id=any($2::uuid[])) for update',[fingerprints,targetIds])).rows;
  for(const collision of collisions)await client.query('update questions set fingerprint=null where id=$1',[collision.id]);
  for(const q of payload.questions){const existing=(await client.query('select id from questions where id=$1',[q.id])).rowCount;if(existing){const inOther=(await client.query('select count(*)::int n from mock_test_form_questions where question_id=$1 and form_id<>$2',[q.id,form.id])).rows[0].n;if(inOther)throw Error('Question in other form '+q.id)}await upsert('questions',cols,q)}
  await client.query('delete from mock_test_form_questions where form_id=$1',[form.id]);
  for(const o of payload.order)await client.query('insert into mock_test_form_questions (form_id,question_id,section_key,position,correct_answer_snapshot,topic_id_snapshot,topic_name_snapshot) select $1,q.id,$2,$3,q.correct_answer,q.topic_id,t.name from questions q join act_topics t on t.id=q.topic_id where q.id=$4',[form.id,o.section_key,o.position,o.question_id]);
  await client.query("update mock_test_forms set status='locked',locked_at=now(),updated_at=now() where id=$1",[form.id]);
  const actual=await fetchRows();
  const fixedAfter=actual.filter(r=>['math','science'].includes(r.section_key)).map(r=>[r.section_key,r.position,r.id]);
  if(JSON.stringify(fixedAfter)!==JSON.stringify(fixedBefore))throw Error('Math/Science changed during import');
  const oldIds=oldReserve.map(q=>q.id);
  const retained=(await client.query('select id,usage_scope from questions where id=any($1::uuid[])',[oldIds])).rows;
  if(retained.length!==86||retained.some(q=>q.usage_scope!=='mock_reserve'))throw Error('Old E/R questions not preserved in mock_reserve');
  const result=digest(canonical(actual));if(result!==payload.checksum)throw Error('Post-import checksum mismatch');
  const snapshots=(await client.query('select fq.section_key,fq.position,fq.topic_id_snapshot,fq.topic_name_snapshot,q.topic_id,t.name from mock_test_form_questions fq join questions q on q.id=fq.question_id join act_topics t on t.id=q.topic_id where fq.form_id=$1',[form.id])).rows;
  if(snapshots.length!==171||snapshots.some(r=>r.topic_id_snapshot!==r.topic_id||r.topic_name_snapshot!==r.name))throw Error('Topic snapshots mismatch');
  await client.query('COMMIT');console.log(JSON.stringify({imported:171,checksum:result,status:'locked',mockStatus:'open',counts}));
 }else throw Error('Use export, compare, or import');
}catch(e){if(mode==='import')await client.query('ROLLBACK').catch(()=>{});console.error('FAILED:',e.message);process.exitCode=1}finally{await client.end().catch(()=>{})}
