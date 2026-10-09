import { Client } from "pg";
const setIds=[
"1c199a0d-f8a4-4626-bc7e-b4499e0829dc",
"508bc6d8-7699-462e-affc-66b0c5477484",
"152464b2-ab61-4fcc-b7ce-22c9765cd27f",
"3c753005-f798-4db0-8860-31afb035cbbd"
];
const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
await c.query("BEGIN");
try{
 const pre=await c.query("select count(*)::int n from questions where question_set_id=any($1::uuid[]) and status='draft'",[setIds]);
 if(pre.rows[0].n!==20) throw new Error(`Expected 20 draft questions, found ${pre.rows[0].n}`);
 const u=await c.query(`
   update questions
   set status='published',
       reviewed_at=now(),
       review_notes=coalesce(review_notes,'') || E'\n[reading-review-2026-10-05] Full content review completed; answer logic, passage support, difficulty, distractors, and structure checked; approved for controlled publication.',
       updated_at=now()
   where question_set_id=any($1::uuid[]) and status='draft'
   returning id
 `,[setIds]);
 if(u.rowCount!==20) throw new Error(`Expected 20 updates, got ${u.rowCount}`);
 await c.query("COMMIT");
 const total=await c.query("select count(*)::int n from questions where section_key='reading' and status='published'");
 const topics=await c.query(`
   select t.slug topic,count(*)::int n
   from questions q join act_topics t on t.id=q.topic_id
   where q.section_key='reading' and q.status='published'
   group by t.slug order by t.slug
 `);
 console.log(JSON.stringify({published:u.rowCount,totalReadingPublished:total.rows[0].n,topics:topics.rows},null,2));
}catch(e){await c.query("ROLLBACK");throw e}
await c.end();