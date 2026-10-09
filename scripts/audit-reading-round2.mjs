import { Client } from "pg";
import { reviewQuestionQuality } from "../lib/question-utils.ts";

const setIds=[
"003c8fd5-0f97-4d51-894a-1eaf81138599",
"fad8044e-9ffd-476b-9f3b-12bd86910bcc",
"f9860b5e-00aa-490d-873e-9cad0d0ae98b",
"0be95cd4-85de-472f-b62e-d6b2c020962d",
"e754ec49-ffe5-4b72-98ce-550827d56eb9",
"7c6d0532-f8fd-4952-a15c-9b981c7f3239",
"62daecef-2eb8-48c6-948e-73f4bafb4a33",
"926b8e0d-2e1a-42a9-a33c-ff23efbb8ed8",
"30bf62fa-bc4a-4700-a006-d3de40376155"
];

const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();

const {rows}=await c.query(`
 select q.id,q.section_key,q.difficulty,q.prompt,q.choices,q.correct_answer,q.explanation,
        q.fingerprint,q.status,q.source,q.generation_model,q.question_set_id,
        t.slug topic_slug,t.name topic_name,qs.title set_title,qs.content stimulus
 from questions q
 join act_topics t on t.id=q.topic_id
 left join question_sets qs on qs.id=q.question_set_id
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

const counts={topic:{},difficulty:{},answer:{},status:{},source:{},model:{}};
for(const r of rows){
  for(const [obj,key,val] of [
    [counts.topic,r.topic_slug,1],[counts.difficulty,r.difficulty,1],[counts.answer,r.correct_answer,1],
    [counts.status,r.status,1],[counts.source,r.source,1],[counts.model,r.generation_model,1]
  ]) obj[key]=(obj[key]||0)+1;
}

const summaries=[...new Map(rows.map(r=>[r.question_set_id,{id:r.question_set_id,title:r.set_title,topic:r.topic_slug,source:r.source,model:r.generation_model}])).values()].map(s=>{
 const rs=rows.filter(r=>r.question_set_id===s.id);
 return {...s,n:rs.length,pattern:rs.map(r=>r.correct_answer).join(""),difficulties:rs.map(r=>r.difficulty),wordCount:(rs[0]?.stimulus||"").trim().split(/\s+/).length};
});

function norm(s){return String(s||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim()}
const toks=s=>new Set(norm(s).split(" ").filter(w=>w.length>3));
function jac(a,b){const A=toks(a),B=toks(b); if(!A.size||!B.size)return 0; let inter=0; for(const x of A) if(B.has(x)) inter++; return inter/(A.size+B.size-inter);}
const near=[];
for(let i=0;i<rows.length;i++) for(let j=i+1;j<rows.length;j++){
 const score=jac(rows[i].prompt,rows[j].prompt);
 if(score>=0.62) near.push({score:+score.toFixed(3),a:rows[i].set_title,b:rows[j].set_title,qa:rows[i].prompt,qb:rows[j].prompt});
}
near.sort((a,b)=>b.score-a.score);

const allReading=await c.query(`
 select q.id,q.prompt,q.fingerprint,q.status,qs.title set_title
 from questions q left join question_sets qs on qs.id=q.question_set_id
 where q.section_key='reading'
`);
const batchIds=new Set(rows.map(r=>r.id));
const crossFp=[];
for(const r of rows){
 const m=allReading.rows.filter(x=>x.id!==r.id && x.fingerprint && x.fingerprint===r.fingerprint);
 if(m.length) crossFp.push({id:r.id,set:r.set_title,matches:m});
}
const crossStem=[];
for(const r of rows){
 const n=norm(r.prompt);
 const m=allReading.rows.filter(x=>x.id!==r.id && norm(x.prompt)===n);
 if(m.length) crossStem.push({id:r.id,set:r.set_title,prompt:r.prompt,matches:m.map(x=>({id:x.id,set:x.set_title,status:x.status}))});
}

console.log(JSON.stringify({
 total:rows.length,counts,qualityIssueCount:issues.length,issues,summaries,
 nearStemPairsAtLeast062:near.length,near:near.slice(0,30),
 crossFingerprintDuplicates:crossFp.length,crossFp,
 crossExactStemDuplicates:crossStem.length,crossStem
},null,2));
await c.end();