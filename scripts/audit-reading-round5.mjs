import { Client } from "pg";
import { reviewQuestionQuality } from "../lib/question-utils.ts";

const setIds=[
"ba052feb-9773-4732-ae06-2131699dbc79",
"199442f6-f03f-4de5-99e7-acc1b0a9f6e0",
"2eb15e5b-4260-4c63-a952-6cae4a54a1cd"
];

const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
const {rows}=await c.query(`
 select q.id,q.section_key,q.difficulty,q.prompt,q.choices,q.correct_answer,q.explanation,
        q.fingerprint,q.status,q.source,q.generation_model,q.question_set_id,
        t.slug topic_slug,t.name topic_name,qs.title set_title,qs.content stimulus
 from questions q
 join act_topics t on t.id=q.topic_id
 join question_sets qs on qs.id=q.question_set_id
 where q.question_set_id=any($1::uuid[])
 order by qs.created_at,q.created_at
`,[setIds]);

const issues=[];
for(const r of rows){
  const qr=reviewQuestionQuality({
    id:r.id,section:r.section_key,topic:r.topic_name,difficulty:r.difficulty,
    passage:r.stimulus||"",question_text:r.prompt,choices:r.choices,
    correct_answer:r.correct_answer,explanation:r.explanation
  });
  if(qr.blockingFlags.length||qr.warningFlags.length) issues.push({id:r.id,set:r.set_title,prompt:r.prompt,blocking:qr.blockingFlags,warning:qr.warningFlags});
}

function norm(s){return String(s||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim()}
const toks=s=>new Set(norm(s).split(" ").filter(w=>w.length>3));
function jac(a,b){const A=toks(a),B=toks(b); if(!A.size||!B.size)return 0; let inter=0; for(const x of A) if(B.has(x)) inter++; return inter/(A.size+B.size-inter);}

const counts={topic:{},difficulty:{},answer:{},status:{},source:{}};
for(const r of rows){
  for(const [obj,key] of [[counts.topic,r.topic_slug],[counts.difficulty,r.difficulty],[counts.answer,r.correct_answer],[counts.status,r.status],[counts.source,r.source]]) obj[key]=(obj[key]||0)+1;
}
const summaries=[...new Map(rows.map(r=>[r.question_set_id,{id:r.question_set_id,title:r.set_title,topic:r.topic_slug,source:r.source}])).values()].map(s=>{
 const rs=rows.filter(r=>r.question_set_id===s.id);
 return {...s,n:rs.length,pattern:rs.map(r=>r.correct_answer).join(""),difficulties:rs.map(r=>r.difficulty),wordCount:(rs[0]?.stimulus||"").trim().split(/\s+/).length};
});

const allReading=(await c.query(`
 select q.id,q.prompt,q.fingerprint,q.status,qs.title set_title,qs.content stimulus,q.question_set_id
 from questions q left join question_sets qs on qs.id=q.question_set_id
 where q.section_key='reading'
`)).rows;
let fp=0,exact=0,near=0,passage=0;
const nearPairs=[];
for(const r of rows){
 if(allReading.some(x=>x.id!==r.id && x.fingerprint && x.fingerprint===r.fingerprint)) fp++;
 if(allReading.some(x=>x.id!==r.id && norm(x.prompt)===norm(r.prompt))) exact++;
 for(const x of allReading){
   if(x.id===r.id) continue;
   const score=jac(x.prompt,r.prompt);
   if(score>=0.62){near++; nearPairs.push({score:+score.toFixed(3),a:r.set_title,qa:r.prompt,b:x.set_title,qb:x.prompt,status:x.status});}
 }
}
const setMap=new Map(rows.map(r=>[r.question_set_id,r]));
for(const [sid,r] of setMap){
 if(allReading.some(x=>x.question_set_id&&x.question_set_id!==sid&&jac(r.stimulus,x.stimulus)>=0.18)) passage++;
}

console.log(JSON.stringify({total:rows.length,counts,qualityIssueCount:issues.length,issues,summaries,
 fingerprintDupQuestions:fp,exactStemDupQuestions:exact,nearStemHitsAt062:near,nearPairs,
 setsWithPassageOverlapAt018:passage},null,2));
await c.end();