import pg from "pg";
const {Client}=pg;
const c=new Client({connectionString:process.env.DATABASE_URL});
await c.connect();
const topics=await c.query("select section_key,slug,name,is_active from act_topics where section_key='reading' order by slug");
const counts=await c.query("select t.slug,q.status,q.difficulty,count(*)::int n from questions q join act_topics t on t.id=q.topic_id where q.section_key='reading' group by t.slug,q.status,q.difficulty order by t.slug,q.status,q.difficulty");
console.log(JSON.stringify({topics:topics.rows,counts:counts.rows},null,2));
await c.end();