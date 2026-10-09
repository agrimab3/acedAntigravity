import fs from "node:fs";
import { createHash } from "node:crypto";
import pg from "pg";
import { reviewQuestionQuality } from "../lib/question-utils.ts";
const {Client}=pg;
const norm=v=>String(v??"").toLowerCase().replace(/\[\/?underline\]/g," ").replace(/[^a-z0-9']+/g," ").replace(/\s+/g," ").trim();
const toks=v=>new Set(norm(v).split(" ").filter(x=>x.length>2));
const jac=(a,b)=>{let n=0; for(const x of a) if(b.has(x)) n++; return n/Math.max(1,a.size+b.size-n)};
const fp=q=>createHash("sha256").update(["english",q.topic,q.difficulty,norm(q.passage),norm(q.question_text),["A","B","C","D"].map(k=>k+":"+norm(q.choices[k])).join("|")].join("||")).digest("hex");
const qs=fs.readFileSync("tmp_eng64.ndjson","utf8").trim().split(/\n+/).map(JSON.parse);
const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
try{
 const topics=(await c.query("select id,slug,name from act_topics where section_key='english' and is_active=true")).rows;
 const tmap=new Map(topics.map(t=>[t.slug,t]));
 const db=(await c.query(`select q.id,q.status,q.difficulty,q.prompt as question_text,q.passage,q.choices,q.correct_answer,q.explanation,q.fingerprint,t.slug topic
 from questions q join act_topics t on t.id=q.topic_id where q.section_key='english'`)).rows;
 const audit=[];
 for(const q of qs){
   const t=tmap.get(q.topic); if(!t) throw new Error("missing topic "+q.topic);
   const qr=reviewQuestionQuality({id:q._source+"#"+q._source_index,section:"english",topic:t.name,difficulty:q.difficulty,passage:q.passage,question_text:q.question_text,choices:q.choices,correct_answer:q.correct_answer,explanation:q.explanation});
   audit.push({...q,key:q._source+"#"+q._source_index,fingerprint:fp(q),qr});
 }
 const fps=audit.map(q=>q.fingerprint);
 const internal=fps.map((x,i)=>[x,i]).filter(([x,i])=>fps.indexOf(x)!==i).map(([x,i])=>audit[i].key);
 const dbfp=new Map(db.filter(x=>x.fingerprint).map(x=>[x.fingerprint,x]));
 const collisions=audit.filter(q=>dbfp.has(q.fingerprint)).map(q=>({key:q.key,with:dbfp.get(q.fingerprint).id}));
 const pairs=[];
 const basis=q=>toks(q.question_text+" "+q.passage+" "+Object.values(q.choices).join(" "));
 for(let i=0;i<audit.length;i++){
   const ai=basis(audit[i]);
   for(let j=0;j<i;j++){
     if(audit[i].topic!==audit[j].topic) continue;
     const s=jac(ai,basis(audit[j]));
     if(s>=0.34) pairs.push({score:+s.toFixed(3),a:audit[i].key,b:audit[j].key,topic:audit[i].topic,pa:audit[i].question_text,pb:audit[j].question_text});
   }
   for(const d of db){
     if(audit[i].topic!==d.topic) continue;
     const s=jac(ai,basis(d));
     if(s>=0.34) pairs.push({score:+s.toFixed(3),a:audit[i].key,b:"db:"+d.id,topic:audit[i].topic,pa:audit[i].question_text,pb:d.question_text});
   }
 }
 pairs.sort((a,b)=>b.score-a.score);
 console.log(JSON.stringify({
   count:audit.length,
   blockers:audit.filter(q=>q.qr.blockingFlags.length).map(q=>({key:q.key,topic:q.topic,prompt:q.question_text,flags:q.qr.blockingFlags})),
   warnings:audit.filter(q=>q.qr.warningFlags.length).map(q=>({key:q.key,flags:q.qr.warningFlags})),
   internalFingerprints:internal,
   fingerprintCollisions:collisions,
   near:pairs.slice(0,80)
 },null,2));
} finally {await c.end()}
