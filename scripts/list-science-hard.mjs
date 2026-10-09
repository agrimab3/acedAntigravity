import { Client } from "pg";
const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
const {rows}=await c.query(`
 select q.id,q.difficulty,q.prompt,q.correct_answer,t.slug topic,qs.title
 from questions q join act_topics t on t.id=q.topic_id left join question_sets qs on qs.id=q.question_set_id
 where q.section_key='science' and q.status='published' and q.difficulty='hard'
 order by t.slug,qs.created_at
`);
for(const r of rows) console.log(JSON.stringify(r));
await c.end();