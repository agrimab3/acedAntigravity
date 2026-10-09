import { Client } from "pg";
import { reviewQuestionQuality } from "../lib/question-utils.ts";

const setIds=[
"c57a2213-7d41-49ff-a0bb-ee278aec6cea",
"140b695a-95df-4d39-b3d9-ac67f27042ab",
"5b3bcf1d-35f6-4398-933b-17c5466f8996",
"b50eb640-c072-444d-acf0-edaf2daebd02",
"12cf3c23-51f1-4c22-88fe-2ead466ef852",
"41ca1293-4929-48b2-aa30-c14b014a3bfa",
"b95cd0b5-b1a3-46a2-9cc0-de97b9c16521"
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
  for(const [obj,key] of [[counts.topic,r.topic_slug],[counts.difficulty,r.difficulty],[counts.answer,r.correct_answer],[counts.status,r.status],[counts.source,r.source],[counts.model,r.generation_model]]) obj[key]=(obj[key]||0)+1;
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
 select q.id,q.prompt,q.fingerprint,q.status,qs.title set_title,qs.content stimulus,q.question_set_id
 from questions q left join question_sets qs on qs.id=q.question_set_id
 where q.section_key='reading'
`);
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
const batchSet=new Set(setIds);
const uniqueSets=[...new Map(allReading.rows.filter(x=>x.question_set_id).map(x=>[x.question_set_id,{id:x.question_set_id,title:x.set_title,stimulus:x.stimulus,status:x.status}])).values()];
const passageNear=[];
for(const a of summaries){
 const ra=rows.find(r=>r.question_set_id===a.id);
 for(const b of uniqueSets){
   if(b.id===a.id) continue;
   if(batchSet.has(b.id) && a.id>b.id) continue;
   const score=jac(ra.stimulus,b.stimulus);
   if(score>=0.18) passageNear.push({score:+score.toFixed(3),a:a.title,b:b.title,bStatus:b.status,batchB:batchSet.has(b.id)});
 }
}
passageNear.sort((x,y)=>y.score-x.score);

console.log(JSON.stringify({
 total:rows.length,counts,qualityIssueCount:issues.length,issues,summaries,
 nearStemPairsAtLeast062:near.length,near,
 crossFingerprintDuplicates:crossFp.length,crossFp,
 crossExactStemDuplicates:crossStem.length,crossStem,
 passagePairsAtLeast018:passageNear.length,passageNear:passageNear.slice(0,30)
},null,2));
await c.end();