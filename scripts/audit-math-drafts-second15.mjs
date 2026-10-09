import { Client } from "pg";
import { reviewQuestionQuality } from "../lib/question-utils.ts";

const ids=[
"8112cdb3-bd9a-40ec-a4ee-603b6341139b",
"db51825c-44e3-4bc7-bfba-227f4e6e8c75",
"54bf471c-8865-4bbe-be1e-c3e5946bf173",
"8674c35b-b810-4b09-a81c-a3c94278130c",
"751b267c-f98d-4a81-97df-ef45f81190ef",
"fe1b413c-bfd6-4b27-a07f-45576d689458",
"f18fabd9-0d36-46dc-bab7-0c57e21bbb13",
"032105ee-882b-4ab3-b806-53519e76587a",
"fbc95fe5-b898-48d5-bfa4-2e09d95f478c",
"0b5b52c1-31ed-4444-90b7-717179b1b236",
"a5d4fbbd-cd7f-4a0c-abf1-8bcc2c3f40ea",
"852b4e7e-26eb-44c9-a611-71088d4661e6",
"bae4b1f9-10ed-416f-80c0-a2e571442ab4",
"7876f520-aab9-45fc-aabe-529fb4d07167",
"1b47dd3a-d962-4be6-af02-7dc6d28ca48c"
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
 out.push({n:i+16,id:r.id,topic:r.topic_slug,difficulty:r.difficulty,
   blocking:qr.blockingFlags,warning:qr.warningFlags,riskScore:qr.riskScore});
}
console.log(JSON.stringify(out,null,2));
await c.end();