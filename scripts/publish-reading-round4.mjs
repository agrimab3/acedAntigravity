import { Client } from "pg";

const setIds=[
"b856dafe-6eaf-4a26-b206-2501d0550906",
"562aa20b-0fc2-4dbc-9166-3315607f7ad4",
"bc9dd8e3-379b-4bac-9243-41d587cc7f81",
"5f76cdd4-2c8c-4026-8012-3d7ca710d2c4",
"f5ced560-537b-45bc-82d7-fad797081cc8",
"0c91399c-d139-43eb-989d-76690c8b721b",
"3db5645b-b72d-458b-892b-8c59984b08ac",
"e4f5a646-62e5-407d-8203-3301914ced0d"
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

  if(before.rows[0].n!==40) throw new Error(`Expected 40 Round 4 rows, found ${before.rows[0].n}`);
  if(before.rows[0].drafts!==40) throw new Error(`Expected all 40 Round 4 rows to be draft; found ${before.rows[0].drafts} drafts and ${before.rows[0].published} published`);

  const note="[reading-round4-final-review-2026-10-06] Combined 40-question Round 4 review passed; approved and published by explicit user authorization.";
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
  `,[setIds,note]);

  if(u.rowCount!==40) throw new Error(`Expected to publish 40 rows, updated ${u.rowCount}`);

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
    verifiedRound4Published:verify.rows[0].published_now,
    totalReadingPublished:total.rows[0].total_reading_published,
    publishedByTopic:topics.rows
  },null,2));
}catch(e){
  try{await c.query("ROLLBACK")}catch{}
  throw e;
}finally{
  await c.end();
}
