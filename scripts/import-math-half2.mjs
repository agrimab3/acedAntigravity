import fs from "node:fs";
import {createHash,randomUUID} from "node:crypto";
import pg from "pg";
import {reviewQuestionQuality} from "../lib/question-utils.ts";
const {Client}=pg;
const files=[
 ["manual_gemini","gemini-manual","tmp_r1_gemini.json","gemini_r1"],
 ["manual_gemini","gemini-manual","tmp_r2_gemini.json","gemini_r2"],
 ["manual_claude","claude-pro-manual","tmp_r2_claude.json","claude_r2"]
];
const DROP=new Set([
 "gemini_r1#1","gemini_r1#4","gemini_r1#6","gemini_r1#7","gemini_r1#8","gemini_r1#9","gemini_r1#10",
 "gemini_r1#17","gemini_r1#22","gemini_r1#25","gemini_r1#26",
 "gemini_r2#4","gemini_r2#7","gemini_r2#9","gemini_r2#11","gemini_r2#15","gemini_r2#16","gemini_r2#19",
 "gemini_r2#20","gemini_r2#22","gemini_r2#29",
 "claude_r2#25"
]);
const RELABEL=new Map([["claude_r2#16","easy"],["claude_r2#22","easy"]]);
const norm=v=>String(v??"").replace(/\s+/g," ").trim().toLowerCase();
const fp=({topic,difficulty,prompt,choices})=>createHash("sha256").update(["math",topic,difficulty,"",norm(prompt),["A","B","C","D"].map(k=>k+":"+norm(choices[k])).join("|")].join("||")).digest("hex");
const all=[];
for(const [source,model,file,label] of files){
 const x=JSON.parse(fs.readFileSync(file,"utf8"));
 x.questions.forEach((q,i)=>{const key=label+"#"+(i+1);all.push({...q,difficulty:RELABEL.get(key)||q.difficulty,source,model,label,key});});
}
const kept=all.filter(q=>!DROP.has(q.key));
const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
try{
 const topics=(await c.query("select id,slug,name from act_topics where section_key='math' and is_active=true")).rows;
 const tmap=new Map(topics.map(t=>[t.slug,t]));
 const reviewed=[];
 for(const q of kept){
  const t=tmap.get(q.topic); if(!t)throw new Error("Missing topic "+q.topic);
  const qr=reviewQuestionQuality({id:q.key,section:"math",topic:t.name,difficulty:q.difficulty,passage:"",question_text:q.question_text,choices:q.choices,correct_answer:q.correct_answer,explanation:q.explanation});
  reviewed.push({...q,topicId:t.id,topicName:t.name,fingerprint:fp({topic:q.topic,difficulty:q.difficulty,prompt:q.question_text,choices:q.choices}),qr});
 }
 const bad=reviewed.filter(q=>q.qr.blockingFlags.length||q.qr.warningFlags.length);
 const fps=reviewed.map(q=>q.fingerprint);
 const existing=(await c.query("select id,fingerprint,status from questions where fingerprint=any($1::text[])",[fps])).rows;
 const internalDup=fps.length-new Set(fps).size;
 const byTopic={};const byDiff={};const bySource={};
 for(const q of reviewed){byTopic[q.topic]=(byTopic[q.topic]||0)+1;byDiff[q.difficulty]=(byDiff[q.difficulty]||0)+1;bySource[q.label]=(bySource[q.label]||0)+1;}
 console.log(JSON.stringify({input:all.length,dropped:all.length-kept.length,kept:kept.length,bad:bad.map(q=>({key:q.key,blocking:q.qr.blockingFlags,warning:q.qr.warningFlags})),existingFingerprintCollisions:existing.length,internalFingerprintDuplicates:internalDup,byTopic,byDiff,bySource,drop:[...DROP],relabel:[...RELABEL]},null,2));
 if(process.argv.includes("--import")){
  if(bad.length||existing.length||internalDup)throw new Error("Refusing import due audit failures");
  await c.query("BEGIN"); const runId=randomUUID();
  for(const q of reviewed){
   await c.query(`insert into questions(section_key,topic_id,difficulty,question_type,prompt,passage,fingerprint,choices,correct_answer,explanation,source,generation_model,status,review_notes)
    values('math',$1,$2,'multiple_choice',$3,null,$4,$5::jsonb,$6,$7,$8,$9,'draft',$10)`,
    [q.topicId,q.difficulty,q.question_text,q.fingerprint,JSON.stringify(q.choices),q.correct_answer,q.explanation,q.source,q.model,"[math-generation-half2-import-2026-10-06] Candidate survived cross-model/existing-bank overlap pruning; deterministic checks clean; final human audit still required."]);
   await c.query(`insert into question_generation_audits(run_id,candidate_id,section_key,topic_id,topic_name,requested_difficulty,generated_difficulty,passage,prompt,choices,correct_answer,explanation,generation_provider,generation_model,deterministic_findings,blocking_flags,warning_flags,final_disposition,final_reason)
    values($1,$2,'math',$3,$4,$5,$5,'',$6,$7::jsonb,$8,$9,$10,$11,$12::jsonb,'[]'::jsonb,'[]'::jsonb,'stored_draft',$13)`,
    [runId,randomUUID(),q.topicId,q.topicName,q.difficulty,q.question_text,JSON.stringify(q.choices),q.correct_answer,q.explanation,q.source,q.model,JSON.stringify(q.qr.findings),"Half-2 Math candidate survived overlap pruning; draft only pending final audit."]);
  }
  await c.query("COMMIT");
  console.log(JSON.stringify({imported:reviewed.length,runId},null,2));
 }
}catch(e){try{await c.query("ROLLBACK")}catch{};throw e}finally{await c.end();}
