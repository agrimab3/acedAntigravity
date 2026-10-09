import pg from "pg";
import { reviewQuestionQuality } from "../lib/question-utils.ts";
const {Client}=pg;
const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
const drafts=(await c.query(`
 select q.id,q.prompt,q.choices,q.correct_answer,q.explanation,q.difficulty,q.fingerprint,q.source,q.generation_model,
        t.slug topic,t.name topic_name
 from questions q join act_topics t on t.id=q.topic_id
 where q.section_key='math' and q.status='draft'
 order by q.created_at,q.id
`)).rows;
const pubs=(await c.query(`
 select q.id,q.prompt,q.choices,q.correct_answer,q.explanation,q.difficulty,q.fingerprint,
        t.slug topic
 from questions q join act_topics t on t.id=q.topic_id
 where q.section_key='math' and q.status='published'
`)).rows;
await c.end();

const stop=new Set("a an the of to and or is are be for in on at from with by what which if then this that these those value values following does do how many much when where all real number numbers units unit given below above find calculate determine according model".split(/\s+/));
function toks(s,{nums=false}={}){
 s=String(s).toLowerCase().replace(/[−–—]/g,"-").replace(/\d+(?:\.\d+)?/g,nums?" # ":" ").replace(/[^a-z#]+/g," ");
 return s.split(/\s+/).filter(x=>x&&!stop.has(x));
}
function jac(a,b){const A=new Set(a),B=new Set(b);let i=0;for(const x of A)if(B.has(x))i++;return i/(A.size+B.size-i||1)}
function sim(a,b){return Math.max(jac(toks(a),toks(b)),jac(toks(a,{nums:true}),toks(b,{nums:true})))}
const deterministic=[];
const explanationFlags=[];
const duplicateFlags=[];
const keyCounts={A:0,B:0,C:0,D:0};
for(const q of drafts){
 keyCounts[q.correct_answer]=(keyCounts[q.correct_answer]||0)+1;
 const qr=reviewQuestionQuality({id:q.id,section:"math",topic:q.topic_name,difficulty:q.difficulty,passage:"",question_text:q.prompt,choices:q.choices,correct_answer:q.correct_answer,explanation:q.explanation});
 if(qr.blockingFlags.length||qr.warningFlags.length) deterministic.push({id:q.id,prompt:q.prompt,topic:q.topic,difficulty:q.difficulty,blocking:qr.blockingFlags,warning:qr.warningFlags});
 const e=q.explanation.toLowerCase();
 const suspicious=[];
 if(/requires repair|needs repair|listed choices do not|none of the choices|should be choice|not [abcd][\.,]|wait|recalculate|however,? the listed|does not match/i.test(q.explanation)) suspicious.push("self-contradiction/repair-language");
 const mentions=[...q.explanation.matchAll(/choice\s+([ABCD])/gi)].map(m=>m[1].toUpperCase());
 if(mentions.length && mentions.at(-1)!==q.correct_answer) suspicious.push("final-choice-reference-mismatch");
 if(suspicious.length) explanationFlags.push({id:q.id,prompt:q.prompt,key:q.correct_answer,flags:suspicious,explanation:q.explanation});
}
for(let i=0;i<drafts.length;i++){
 for(let j=i+1;j<drafts.length;j++){
  if(drafts[i].topic!==drafts[j].topic) continue;
  const s=sim(drafts[i].prompt,drafts[j].prompt);
  if(s>=0.56) duplicateFlags.push({kind:"draft-draft",score:+s.toFixed(3),a:drafts[i].id,b:drafts[j].id,topic:drafts[i].topic,pa:drafts[i].prompt,pb:drafts[j].prompt});
 }
 for(const p of pubs){
  if(drafts[i].topic!==p.topic) continue;
  const s=sim(drafts[i].prompt,p.prompt);
  if(s>=0.56) duplicateFlags.push({kind:"draft-published",score:+s.toFixed(3),a:drafts[i].id,b:p.id,topic:drafts[i].topic,pa:drafts[i].prompt,pb:p.prompt});
 }
}
duplicateFlags.sort((a,b)=>b.score-a.score);
const fpDup=[...new Map(drafts.map(q=>[q.fingerprint,0])).keys()].filter(fp=>drafts.filter(q=>q.fingerprint===fp).length>1);
const exactStemDup=[];
const stemMap=new Map();
for(const q of drafts){const n=q.prompt.replace(/\s+/g," ").trim().toLowerCase(); if(stemMap.has(n)) exactStemDup.push([stemMap.get(n),q.id]); else stemMap.set(n,q.id)}
const byTopic={},byDifficulty={},bySource={};
for(const q of drafts){byTopic[q.topic]=(byTopic[q.topic]||0)+1;byDifficulty[q.difficulty]=(byDifficulty[q.difficulty]||0)+1;bySource[q.source]=(bySource[q.source]||0)+1}
console.log(JSON.stringify({draftCount:drafts.length,publishedCount:pubs.length,byTopic,byDifficulty,keyCounts,bySource,deterministicCount:deterministic.length,deterministic,explanationFlagCount:explanationFlags.length,explanationFlags,internalFingerprintDuplicateCount:fpDup.length,exactStemDuplicateCount:exactStemDup.length,nearDuplicateFlagCount:duplicateFlags.length,nearDuplicateFlags:duplicateFlags.slice(0,160)},null,2));