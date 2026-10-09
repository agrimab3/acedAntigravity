import { Client } from "pg";
import { reviewQuestionQuality } from "../lib/question-utils.ts";

const ids=[
"962e7206-e16c-4aac-8970-11fc56dd8db2",
"2618976e-caee-4840-845a-dd37b5a29f46",
"dc5e624e-2236-4ed9-a6b1-fb4dced447e1",
"adb98d45-0b90-4e9f-b167-9175c0a76c94",
"97a4a4ae-667c-4b55-9612-7984fdb8e31e",
"a06ebe41-4248-4bc6-8261-c555dfd31740",
"19f52c24-e07e-495e-8190-2790510d92fb",
"6c444ef4-ad2b-482c-9efb-4126cd8e4fa9",
"4692d63b-55b1-412f-8698-481a1485d2e3",
"6dc1a39b-7289-47b0-93ba-13e37787048d",
"ab56c5ca-8e6b-451e-a5f9-757bcc305bbf",
"71b3c084-124c-44e0-8461-a7ccd1c2d68a",
"f518cdfb-d60c-45c4-8890-67425298a608",
"5f67248b-fc83-4d44-8f49-f8873f77deea",
"3aad605e-a768-4871-8abf-6d65bf3af995"
];

const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
const {rows}=await c.query(`
 select q.id,q.section_key,q.difficulty,q.prompt,q.choices,q.correct_answer,q.explanation,q.status,
        q.fingerprint,q.source,q.generation_model,t.slug topic_slug,t.name topic_name
 from questions q join act_topics t on t.id=q.topic_id
 where q.id=any($1::uuid[])
 order by array_position($1::uuid[],q.id)
`,[ids]);

const out=[];
for(const [i,r] of rows.entries()){
 const qr=reviewQuestionQuality({
   id:r.id,section:r.section_key,topic:r.topic_name,difficulty:r.difficulty,
   passage:"",question_text:r.prompt,choices:r.choices,
   correct_answer:r.correct_answer,explanation:r.explanation
 });
 out.push({n:i+1,id:r.id,topic:r.topic_slug,difficulty:r.difficulty,
   blocking:qr.blockingFlags,warning:qr.warningFlags,riskScore:qr.riskScore});
}
console.log(JSON.stringify(out,null,2));
await c.end();