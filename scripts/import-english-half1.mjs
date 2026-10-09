import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { reviewQuestionQuality } from "../lib/question-utils.ts";
const {Client}=pg;
const INPUT="tmp_english_half1_survivors.json";
const SRC={
 gemini_r1:["manual_gemini","gemini-manual"],
 chatgpt_r1:["manual_chatgpt","chatgpt-manual"],
 claude_r1:["manual_claude","claude-pro-manual"],
 gemini_r2:["manual_gemini","gemini-manual"]
};
const norm=v=>String(v??"").replace(/\s+/g," ").trim().toLowerCase();
const fp=q=>createHash("sha256").update([
 "english",q.topic,q.difficulty,norm(q.passage),norm(q.question_text),
 ["A","B","C","D"].map(k=>k+":"+norm(q.choices[k])).join("|")
].join("||")).digest("hex");
const raw=JSON.parse(fs.readFileSync(INPUT,"utf8"));
const DROP_BLOCKERS=new Set(["chatgpt_r1#6","chatgpt_r1#10","chatgpt_r1#42","claude_r1#9"]);
const qs=raw.questions.filter(q=>!DROP_BLOCKERS.has(q._source+"#"+q._source_index));
const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
try{
 const topics=(await c.query("select id,slug,name from act_topics where section_key='english' and is_active=true")).rows;
 const tmap=new Map(topics.map(t=>[t.slug,t]));
 const reviewed=[];
 for(const q of qs){
   const t=tmap.get(q.topic); if(!t) throw new Error("missing topic "+q.topic);
   const [source,model]=SRC[q._source]||["manual_unknown","manual-unknown"];
   const qr=reviewQuestionQuality({id:q._source+"#"+q._source_index,section:"english",topic:t.name,difficulty:q.difficulty,passage:q.passage,question_text:q.question_text,choices:q.choices,correct_answer:q.correct_answer,explanation:q.explanation});
   reviewed.push({...q,source,model,topicId:t.id,topicName:t.name,fingerprint:fp(q),qr});
 }
 const bad=reviewed.filter(q=>q.qr.blockingFlags.length);
 const warnings=reviewed.filter(q=>q.qr.warningFlags.length);
 const fps=reviewed.map(q=>q.fingerprint);
 const existing=(await c.query("select id,status,fingerprint,prompt from questions where fingerprint=any($1::text[])",[fps])).rows;
 const internalDup=fps.length-new Set(fps).size;
 console.log(JSON.stringify({
   input:qs.length,
   droppedBlockers:[...DROP_BLOCKERS],
   warningCount:warnings.length,
   bad:bad.map(q=>({key:q._source+"#"+q._source_index,topic:q.topic,difficulty:q.difficulty,prompt:q.question_text,blocking:q.qr.blockingFlags,warning:q.qr.warningFlags})),
   existingFingerprintCollisions:existing,
   internalFingerprintDuplicates:internalDup
 },null,2));
 if(process.argv.includes("--import")){
   if(bad.length||existing.length||internalDup) throw new Error("refusing import due audit failures");
   await c.query("BEGIN");
   const runId=randomUUID();
   for(const q of reviewed){
     const ins=await c.query(`insert into questions(section_key,topic_id,difficulty,question_type,prompt,passage,fingerprint,choices,correct_answer,explanation,source,generation_model,status,review_notes)
       values('english',$1,$2,'multiple_choice',$3,$4,$5,$6::jsonb,$7,$8,$9,$10,'draft',$11) returning id`,
       [q.topicId,q.difficulty,q.question_text,q.passage,q.fingerprint,JSON.stringify(q.choices),q.correct_answer,q.explanation,q.source,q.model,
       "[english-generation-half1-import-2026-10-06] Candidate survived first-half cross-model/existing-bank template pruning; deterministic checks clean; final human audit still required."]);
     await c.query(`insert into question_generation_audits(run_id,candidate_id,section_key,topic_id,topic_name,requested_difficulty,generated_difficulty,passage,prompt,choices,correct_answer,explanation,generation_provider,generation_model,deterministic_findings,blocking_flags,warning_flags,final_disposition,final_reason)
       values($1,$2,'english',$3,$4,$5,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13::jsonb,'[]'::jsonb,$14::jsonb,'stored_draft',$15)`,
       [runId,randomUUID(),q.topicId,q.topicName,q.difficulty,q.passage,q.question_text,JSON.stringify(q.choices),q.correct_answer,q.explanation,q.source,q.model,JSON.stringify(q.qr.findings),JSON.stringify(q.qr.warningFlags),"Half-1 English candidate survived overlap pruning; draft only pending final audit."]);
   }
   await c.query("COMMIT");
   console.log(JSON.stringify({imported:reviewed.length,runId},null,2));
 }
} catch(e){try{await c.query("ROLLBACK")}catch{}; throw e} finally {await c.end()}
