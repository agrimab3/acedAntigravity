import { Client } from "pg";
import { reviewQuestionQuality } from "../lib/question-utils.ts";

const setIds=[
"b856dafe-6eaf-4a26-b206-2501d0550906",
"562aa20b-0fc2-4dbc-9166-3315607f7ad4",
"bc9dd8e3-379b-4bac-9243-41d587cc7f81",
"5f76cdd4-2c8c-4026-8012-3d7ca710d2c4",
"f5ced560-537b-45bc-82d7-fad797081cc8",
"0c91399c-d139-43eb-989d-76690c8b721b",
"3db5645b-b72d-458b-892b-8c59984b08ac",
"e4f5a646-62e5-407d-8203-3301914ced0d"
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
 crossFingerprintDuplicates:crossFp.length,
 crossExactStemDuplicates:crossStem.length,
 passagePairsAtLeast018:passageNear.length,passageNear:passageNear.slice(0,30)
},null,2));
await c.end();