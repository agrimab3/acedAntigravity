import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { reviewQuestionQuality } from "../lib/question-utils.ts";
const {Client}=pg;
const files=[["manual_claude","claude-pro-manual","tmp_r1_claude.json","claude_r1"],["manual_chatgpt","chatgpt-manual","tmp_r1_chatgpt.json","chatgpt_r1"],["manual_chatgpt","chatgpt-manual","tmp_r2_chatgpt.json","chatgpt_r2"]];
const DROP=new Set([
 "chatgpt_r1#1","chatgpt_r1#2","chatgpt_r2#1",
 "chatgpt_r1#3","chatgpt_r2#3",
 "chatgpt_r1#7","chatgpt_r2#7",
 "chatgpt_r1#8","chatgpt_r2#9",
 "chatgpt_r1#9",
 "chatgpt_r1#10","chatgpt_r2#10",
 "claude_r1#38","chatgpt_r1#38",
 "chatgpt_r2#12","chatgpt_r1#12","chatgpt_r2#18"
]);
const norm=v=>String(v??"").replace(/\s+/g," ").trim().toLowerCase();
const fp=({topic,difficulty,prompt,choices})=>createHash("sha256").update(["math",topic,difficulty,"",norm(prompt),["A","B","C","D"].map(k=>k+":"+norm(choices[k])).join("|")].join("||")).digest("hex");
const all=[];
for(const [source,model,file,label] of files){
 const x=JSON.parse(fs.readFileSync(file,"utf8"));
 x.questions.forEach((q,i)=>all.push({...q,source,model,label,key:label+"#"+(i+1)}));
}
const kept=all.filter(q=>!DROP.has(q.key));
const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
try{
 const topics=(await c.query("select id,slug,name from act_topics where section_key='math' and is_active=true")).rows;
 const tmap=new Map(topics.map(t=>[t.slug,t]));
 const reviewed=[];
 for(const q of kept){
  const t=tmap.get(q.topic); if(!t) throw new Error("Missing topic "+q.topic);
  const qr=reviewQuestionQuality({id:q.key,section:"math",topic:t.name,difficulty:q.difficulty,passage:"",question_text:q.question_text,choices:q.choices,correct_answer:q.correct_answer,explanation:q.explanation});
  reviewed.push({...q,topicId:t.id,topicName:t.name,fingerprint:fp({topic:q.topic,difficulty:q.difficulty,prompt:q.question_text,choices:q.choices}),qr});
 }
 const bad=reviewed.filter(q=>q.qr.blockingFlags.length||q.qr.warningFlags.length);
 const fps=reviewed.map(q=>q.fingerprint);
 const existing=(await c.query("select fingerprint from questions where fingerprint=any($1::text[])",[fps])).rows;
 const internalDup=fps.length-new Set(fps).size;
 console.log(JSON.stringify({input:all.length,dropped:all.length-kept.length,kept:kept.length,bad:bad.map(q=>({key:q.key,blocking:q.qr.blockingFlags,warning:q.qr.warningFlags})),existingFingerprintCollisions:existing.length,internalFingerprintDuplicates:internalDup,drop:[...DROP]},null,2));
 if(process.argv.includes("--import")){
   if(bad.length||existing.length||internalDup) throw new Error("Refusing import due audit failures");
   await c.query("BEGIN");
   const runId=randomUUID();
   for(const q of reviewed){
    const ins=await c.query(`insert into questions(section_key,topic_id,difficulty,question_type,prompt,passage,fingerprint,choices,correct_answer,explanation,source,generation_model,status,review_notes)
      values('math',$1,$2,'multiple_choice',$3,null,$4,$5::jsonb,$6,$7,$8,$9,'draft',$10) returning id`,
      [q.topicId,q.difficulty,q.question_text,q.fingerprint,JSON.stringify(q.choices),q.correct_answer,q.explanation,q.source,q.model,`[math-generation-half1-import-2026-10-06] Candidate survived cross-model/published overlap pruning; deterministic checks clean; final human audit still required.`]);
    await c.query(`insert into question_generation_audits(run_id,candidate_id,section_key,topic_id,topic_name,requested_difficulty,generated_difficulty,passage,prompt,choices,correct_answer,explanation,generation_provider,generation_model,deterministic_findings,blocking_flags,warning_flags,final_disposition,final_reason)
      values($1,$2,'math',$3,$4,$5,$5,'',$6,$7::jsonb,$8,$9,$10,$11,$12::jsonb,'[]'::jsonb,'[]'::jsonb,'stored_draft',$13)`,
      [runId,randomUUID(),q.topicId,q.topicName,q.difficulty,q.question_text,JSON.stringify(q.choices),q.correct_answer,q.explanation,q.source,q.model,JSON.stringify(q.qr.findings),"Half-1 Math candidate survived overlap pruning; draft only pending final audit."]);
   }
   await c.query("COMMIT");
   console.log(JSON.stringify({imported:reviewed.length,runId},null,2));
 }
} catch(e){try{await c.query("ROLLBACK")}catch{}; throw e} finally {await c.end()}
