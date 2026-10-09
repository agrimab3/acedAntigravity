import { Client } from "pg";
import { createHash } from "node:crypto";
import { reviewQuestionQuality } from "../lib/question-utils.ts";

const ANSWERS=["A","B","C","D"];
const norm=(v="")=>String(v??"").replace(/\s+/g," ").trim().toLowerCase();
const fp=(r)=>{
  const cc=ANSWERS.map(k=>`${k}:${norm(r.choices[k])}`).join("|");
  return createHash("sha256").update([
    r.section_key,r.topic_slug,r.difficulty,norm(r.stimulus||""),norm(r.prompt),cc
  ].join("||")).digest("hex");
};
const stop=new Set(["the","a","an","and","or","of","to","in","on","at","for","with","from","by","is","are","was","were","be","been","being","that","this","which","what","how","would","most","best","based","following","according"]);
const toks=s=>new Set(norm(s).replace(/[^a-z0-9%°]+/g," ").split(" ").filter(x=>x.length>2&&!stop.has(x)));
const jacc=(a,b)=>{
  const A=toks(a),B=toks(b); let inter=0; for(const x of A) if(B.has(x)) inter++;
  const union=A.size+B.size-inter; return union?inter/union:0;
};

const c=new Client({connectionString:process.env.DATABASE_URL});
await c.connect();
const {rows}=await c.query(`
 select q.id,q.section_key,q.difficulty,q.prompt,q.choices,q.correct_answer,q.explanation,q.fingerprint,
        q.source,q.generation_model,q.status,q.question_set_id,t.slug topic_slug,t.name topic_name,
        qs.title set_title,qs.content stimulus
 from questions q
 join act_topics t on t.id=q.topic_id
 left join question_sets qs on qs.id=q.question_set_id
 where q.section_key='science' and q.status='published'
 order by qs.created_at,q.created_at
`);

const quality=[];
const stale=[];
for(const r of rows){
  const qr=reviewQuestionQuality({
    id:r.id,section:"science",topic:r.topic_name,difficulty:r.difficulty,
    passage:r.stimulus||"",question_text:r.prompt,choices:r.choices,
    correct_answer:r.correct_answer,explanation:r.explanation
  });
  if(qr.blockingFlags.length||qr.warningFlags.length) quality.push({
    id:r.id,set:r.set_title,prompt:r.prompt,blocking:qr.blockingFlags,warning:qr.warningFlags,risk:qr.riskScore
  });
  const expected=fp(r);
  if(r.fingerprint!==expected) stale.push({id:r.id,set:r.set_title,stored:r.fingerprint,expected});
}

const group=(keyFn)=>{
 const m=new Map(); for(const r of rows){const k=keyFn(r); if(!m.has(k))m.set(k,[]);m.get(k).push(r);}
 return [...m.entries()];
};
const exactStem=group(r=>norm(r.prompt)).filter(([,x])=>x.length>1).map(([k,x])=>({stem:k,count:x.length,ids:x.map(y=>y.id),sets:[...new Set(x.map(y=>y.set_title))]}));
const fpDup=group(r=>r.fingerprint||"__null__").filter(([k,x])=>k!=="__null__"&&x.length>1).map(([k,x])=>({fingerprint:k,count:x.length,ids:x.map(y=>y.id),sets:[...new Set(x.map(y=>y.set_title))]}));

const near=[];
for(let i=0;i<rows.length;i++) for(let j=i+1;j<rows.length;j++){
  const s=jacc(rows[i].prompt,rows[j].prompt);
  if(s>=0.62 && norm(rows[i].prompt)!==norm(rows[j].prompt)){
    near.push({score:+s.toFixed(3),id1:rows[i].id,id2:rows[j].id,set1:rows[i].set_title,set2:rows[j].set_title,prompt1:rows[i].prompt,prompt2:rows[j].prompt});
  }
}
near.sort((a,b)=>b.score-a.score);

const counts={};
for(const r of rows){
 counts.topic ??={}; counts.topic[r.topic_slug]=(counts.topic[r.topic_slug]||0)+1;
 counts.difficulty ??={}; counts.difficulty[r.difficulty]=(counts.difficulty[r.difficulty]||0)+1;
 counts.answer ??={}; counts.answer[r.correct_answer]=(counts.answer[r.correct_answer]||0)+1;
 counts.source ??={}; counts.source[r.source]=(counts.source[r.source]||0)+1;
}
const byTopicDifficulty={};
const byTopicAnswer={};
for(const r of rows){
 byTopicDifficulty[r.topic_slug]??={easy:0,medium:0,hard:0};
 byTopicDifficulty[r.topic_slug][r.difficulty]=(byTopicDifficulty[r.topic_slug][r.difficulty]||0)+1;
 byTopicAnswer[r.topic_slug]??={A:0,B:0,C:0,D:0};
 byTopicAnswer[r.topic_slug][r.correct_answer]++;
}
const setPatterns=group(r=>r.question_set_id).map(([,x])=>({
 title:x[0].set_title,topic:x[0].topic_slug,n:x.length,
 pattern:x.map(r=>r.correct_answer).join(""),
 difficulties:x.map(r=>r.difficulty).join(",")
}));
const patternGroups={};
for(const s of setPatterns){(patternGroups[s.pattern]??=[]).push(s.title)}
const repeatedPatterns=Object.entries(patternGroups).filter(([,v])=>v.length>1).map(([pattern,sets])=>({pattern,sets}));

const result={
 generatedAt:new Date().toISOString(),
 total:rows.length,
 counts,byTopicDifficulty,byTopicAnswer,
 qualityIssueCount:quality.length,quality,
 staleFingerprintCount:stale.length,stale,
 exactStemDuplicateGroups:exactStem.length,exactStem,
 fingerprintDuplicateGroups:fpDup.length,fingerprintDuplicates:fpDup,
 nearStemPairsAtLeast062:near.length,nearStemTop:near.slice(0,40),
 setPatterns,repeatedPatterns
};
console.log(JSON.stringify(result,null,2));
await c.end();