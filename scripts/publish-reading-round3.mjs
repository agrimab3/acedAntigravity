import { Client } from "pg";

const setIds=[
"c57a2213-7d41-49ff-a0bb-ee278aec6cea",
"140b695a-95df-4d39-b3d9-ac67f27042ab",
"5b3bcf1d-35f6-4398-933b-17c5466f8996",
"b50eb640-c072-444d-acf0-edaf2daebd02",
"12cf3c23-51f1-4c22-88fe-2ead466ef852",
"41ca1293-4929-48b2-aa30-c14b014a3bfa",
"b95cd0b5-b1a3-46a2-9cc0-de97b9c16521"
];

const c=new Client({connectionString:process.env.DATABASE_URL});
await c.connect();
try{
  await c.query("BEGIN");
  const before=await c.query(`
    select count(*)::int n,
           count(*) filter (where status='draft')::int drafts,
           count(*) filter (where status='published')::int published
    from questions
    where question_set_id=any($1::uuid[])
  `,[setIds]);

  if(before.rows[0].n!==35) throw new Error(`Expected 35 Round 3 rows, found ${before.rows[0].n}`);
  if(before.rows[0].drafts!==35) throw new Error(`Expected all 35 Round 3 rows to be draft; found ${before.rows[0].drafts} drafts and ${before.rows[0].published} published`);

  const u=await c.query(`
    update questions
       set status='published',
           reviewed_at=now(),
           updated_at=now(),
           review_notes=case
             when coalesce(review_notes,'')='' then $2
             else review_notes || E'\\n' || $2
           end
     where question_set_id=any($1::uuid[])
       and status='draft'
     returning id
  `,[setIds,"[reading-round3-final-review-2026-10-06] Combined 35-question Round 3 review passed; approved and published by explicit user authorization."]);

  if(u.rowCount!==35) throw new Error(`Expected to publish 35 rows, updated ${u.rowCount}`);

  await c.query("COMMIT");

  const verify=await c.query(`
    select count(*)::int published_now
    from questions
    where question_set_id=any($1::uuid[]) and status='published'
  `,[setIds]);

  const total=await c.query(`
    select count(*)::int total_reading_published
    from questions
    where section_key='reading' and status='published'
  `);

  const topics=await c.query(`
    select t.slug topic,t.name,count(*)::int n
    from questions q join act_topics t on t.id=q.topic_id
    where q.section_key='reading' and q.status='published'
    group by t.slug,t.name
    order by t.slug
  `);

  console.log(JSON.stringify({
    publishedNow:u.rowCount,
    verifiedRound3Published:verify.rows[0].published_now,
    totalReadingPublished:total.rows[0].total_reading_published,
    publishedByTopic:topics.rows
  },null,2));
}catch(e){
  try{await c.query("ROLLBACK")}catch{}
  throw e;
}finally{
  await c.end();
}
