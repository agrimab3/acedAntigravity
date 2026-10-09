import { Client } from "pg";
import { reviewQuestionQuality } from "../lib/question-utils.ts";

const setIds=[
"1c199a0d-f8a4-4626-bc7e-b4499e0829dc",
"508bc6d8-7699-462e-affc-66b0c5477484",
"152464b2-ab61-4fcc-b7ce-22c9765cd27f",
"3c753005-f798-4db0-8860-31afb035cbbd"
];

const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
const {rows}=await c.query(`
 select q.id,q.section_key,q.difficulty,q.prompt,q.choices,q.correct_answer,q.explanation,
        q.fingerprint,q.status,q.source,q.question_set_id,t.slug topic_slug,t.name topic_name,
        qs.title set_title,qs.content stimulus
 from questions q
 join act_topics t on t.id=q.topic_id
 left join question_sets qs on qs.id=q.question_set_id
 where q.question_set_id=any($1::uuid[])
 order by qs.created_at,q.created_at
`,[setIds]);

const quality=[];
for(const r of rows){
 const qr=reviewQuestionQuality({
   id:r.id,section:r.section_key,topic:r.topic_name,difficulty:r.difficulty,
   passage:r.stimulus||"",question_text:r.prompt,choices:r.choices,
   correct_answer:r.correct_answer,explanation:r.explanation
 });
 if(qr.blockingFlags.length||qr.warningFlags.length) quality.push({id:r.id,set:r.set_title,blocking:qr.blockingFlags,warning:qr.warningFlags});
}

const counts={topic:{},difficulty:{},answer:{},status:{},source:{}};
for(const r of rows){
 counts.topic[r.topic_slug]=(counts.topic[r.topic_slug]||0)+1;
 counts.difficulty[r.difficulty]=(counts.difficulty[r.difficulty]||0)+1;
 counts.answer[r.correct_answer]=(counts.answer[r.correct_answer]||0)+1;
 counts.status[r.status]=(counts.status[r.status]||0)+1;
 counts.source[r.source]=(counts.source[r.source]||0)+1;
}
const setSummaries=[...new Map(rows.map(r=>[r.question_set_id,{id:r.question_set_id,title:r.set_title,topic:r.topic_slug}])).values()].map(s=>{
 const rs=rows.filter(r=>r.question_set_id===s.id);
 return {...s,n:rs.length,pattern:rs.map(r=>r.correct_answer).join(""),difficulties:rs.map(r=>r.difficulty),wordCount:(rs[0]?.stimulus||"").trim().split(/\s+/).length};
});
const stemMap=new Map();
for(const r of rows){const k=r.prompt.trim().replace(/\s+/g," ").toLowerCase();const a=stemMap.get(k)||[];a.push(r);stemMap.set(k,a);}
const exactStemDup=[...stemMap.entries()].filter(([,a])=>a.length>1).map(([stem,a])=>({stem,ids:a.map(x=>x.id),sets:a.map(x=>x.set_title)}));
const fpMap=new Map();
for(const r of rows){if(!r.fingerprint) continue; const a=fpMap.get(r.fingerprint)||[];a.push(r);fpMap.set(r.fingerprint,a);}
const fpDup=[...fpMap.entries()].filter(([,a])=>a.length>1).map(([fingerprint,a])=>({fingerprint,ids:a.map(x=>x.id)}));

console.log(JSON.stringify({total:rows.length,counts,qualityIssueCount:quality.length,quality,setSummaries,exactStemDuplicateGroups:exactStemDup.length,exactStemDup,fingerprintDuplicateGroups:fpDup.length,fpDup},null,2));
await c.end();