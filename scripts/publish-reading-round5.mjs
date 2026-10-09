import { Client } from "pg";

const setIds=[
"ba052feb-9773-4732-ae06-2131699dbc79",
"199442f6-f03f-4de5-99e7-acc1b0a9f6e0",
"2eb15e5b-4260-4c63-a952-6cae4a54a1cd"
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

  if(before.rows[0].n!==15) throw new Error(`Expected 15 Round 5 rows, found ${before.rows[0].n}`);
  if(before.rows[0].drafts!==15) throw new Error(`Expected all 15 Round 5 rows to be draft; found ${before.rows[0].drafts} drafts and ${before.rows[0].published} published`);

  const note="[reading-round5-final-review-2026-10-06] Final 15-question Reading batch review passed; approved and published by explicit user authorization.";
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

  if(u.rowCount!==15) throw new Error(`Expected to publish 15 rows, updated ${u.rowCount}`);

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
    verifiedRound5Published:verify.rows[0].published_now,
    totalReadingPublished:total.rows[0].total_reading_published,
    publishedByTopic:topics.rows
  },null,2));
}catch(e){
  try{await c.query("ROLLBACK")}catch{}
  throw e;
}finally{
  await c.end();
}
