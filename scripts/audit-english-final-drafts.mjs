import pg from "pg";
import { createHash } from "node:crypto";
import { reviewQuestionQuality } from "../lib/question-utils.ts";
const {Client}=pg;
const rejectIds=new Set([
"31665249-12d8-4145-8d4e-492e495602e1","6c9b8266-3a08-4db1-942d-8b19c51a005c","5c74c84e-712a-4491-9976-2e03646dffb8",
"496a69e8-d53c-4543-81ec-8947a2ddbbf2","e449b9dc-e42b-44d6-aeac-605e86b90a23","a95d5759-3b52-4c7e-a5f6-0e748d0908c5",
"41105ef2-b8b7-4e04-8f9f-905635efa395","aaacd741-fb41-4813-bf82-be557d41ef20","ffd68fa9-9e80-4ae7-8825-9654c059e7f8",
"3cb4ca99-7320-4ee8-a733-c1e6544db1e2","0742e8d4-1857-4d14-a939-3baf2176233f","2e816065-a787-434f-a2f3-077ca6788491",
"6e7c6c75-ff71-480f-9691-d756765c2542","22f2c66d-cc54-44f6-996e-450aee5414de","8b687c5a-9570-4487-b8cb-897e5e3ce59b",
"8f70d75a-5c99-47cb-b17c-c96ba194a57f","b48905c8-76fc-4e92-a5bd-a59b841dfe39","67c99007-3987-4a95-b908-46494950c49e"
]);
const hardKeep=new Set([
"bd7fa8c5-49cb-4717-a873-d18a9a79d990","4dfe4a9f-2172-4435-8240-0ee3ee93b20e","dbd6ca72-0dc0-4142-860f-eca2020d2450",
"34c2a449-3313-48ec-a653-159c329ece52","c0ab737b-c291-4abd-ad6a-219ded1f73fe","0828046b-3048-41b2-876e-65290ceb25bf",
"2e0c1049-8668-4709-931e-eed2e1dcecb0","8dc7d6b7-0bc8-447c-a9fc-46ddf71edaa5","157f0e82-d6de-4c2e-bc51-a6219ae7fcf0",
"64ecc045-2d18-439e-a5a2-656c5ddbe201","a92fe0d1-700c-4c4c-b937-17718fcc504b","a831bfcc-3c92-4470-8f35-268a33370ed6",
"d1678ca6-2a06-4488-a53c-668875412e45","5dfbe3fc-0835-4db8-9e91-62edcb7c22fc","f87438d6-1a82-46e9-8d98-2c1742d6ff76"
]);
const norm=v=>String(v??"").replace(/\s+/g," ").trim().toLowerCase();
function fp(q){const cs=["A","B","C","D"].map(k=>k+":"+norm(q.choices[k])).join("|");return createHash("sha256").update(["english",q.topic,q.difficulty,norm(q.passage||""),norm(q.prompt),cs].join("||")).digest("hex")}
const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
await c.query("BEGIN");
try{
 for(const id of rejectIds) await c.query(`update questions set status='rejected', review_notes=coalesce(review_notes,'') || E'\n[english-final-audit-2026-10-06] Rejected during final human audit for ambiguity, duplicate/low-value template structure, or implausibly weak distractors.' where id=$1 and section_key='english' and status='draft'`,[id]);
 await c.query(`update questions set explanation=$2, review_notes=coalesce(review_notes,'') || E'\n[english-final-audit-2026-10-06] Explanation letter typo corrected; key and underlying reasoning unchanged.' where id=$1`,[
 "1a63e5a0-06ca-4780-82fc-4d433c0f98dc",
 "The pathways must be installed before flowers are planted along them, so Choice C provides the necessary chronological step. The other choices provide background or intentions rather than the physical action that logically precedes the planting."
 ]);
 const hardRows=(await c.query(`select id from questions where section_key='english' and status='draft' and difficulty='hard'`)).rows;
 for(const r of hardRows) if(!hardKeep.has(r.id)) await c.query(`update questions set difficulty='medium', review_notes=coalesce(review_notes,'') || E'\n[english-final-audit-2026-10-06] Difficulty recalibrated from hard to medium after final human review.' where id=$1`,[r.id]);
 const rows=(await c.query(`select q.id,q.prompt,q.passage,q.choices,q.correct_answer,q.explanation,q.difficulty,t.slug topic,t.name topic_name from questions q join act_topics t on t.id=q.topic_id where q.section_key='english' and q.status='draft'`)).rows;
 for(const q of rows) await c.query("update questions set fingerprint=$2 where id=$1",[q.id,fp(q)]);
 await c.query("COMMIT");
} catch(e){await c.query("ROLLBACK");throw e}
const rows=(await c.query(`select q.id,q.prompt,q.passage,q.choices,q.correct_answer,q.explanation,q.difficulty,q.fingerprint,q.source,t.slug topic,t.name topic_name from questions q join act_topics t on t.id=q.topic_id where q.section_key='english' and q.status='draft' order by q.created_at,q.id`)).rows;
const det=[]; const keys={A:0,B:0,C:0,D:0},topics={},diff={},src={};
for(const q of rows){keys[q.correct_answer]++;topics[q.topic]=(topics[q.topic]||0)+1;diff[q.difficulty]=(diff[q.difficulty]||0)+1;src[q.source]=(src[q.source]||0)+1;const z=reviewQuestionQuality({id:q.id,section:"english",topic:q.topic_name,difficulty:q.difficulty,passage:q.passage||"",question_text:q.prompt,choices:q.choices,correct_answer:q.correct_answer,explanation:q.explanation});if(z.blockingFlags.length)det.push({id:q.id,blocking:z.blockingFlags});}
const fpm=new Map();for(const q of rows){const a=fpm.get(q.fingerprint)||[];a.push(q.id);fpm.set(q.fingerprint,a)}const fpdups=[...fpm.values()].filter(x=>x.length>1);
console.log(JSON.stringify({survivors:rows.length,rejected:rejectIds.size,topics,diff,keys,src,blockingCount:det.length,blocking:det,fingerprintDuplicateCount:fpdups.length},null,2));
await c.end();
