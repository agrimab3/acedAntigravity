import { Client } from "pg";

const setIds=[
"003c8fd5-0f97-4d51-894a-1eaf81138599",
"fad8044e-9ffd-476b-9f3b-12bd86910bcc",
"f9860b5e-00aa-490d-873e-9cad0d0ae98b",
"0be95cd4-85de-472f-b62e-d6b2c020962d",
"e754ec49-ffe5-4b72-98ce-550827d56eb9",
"7c6d0532-f8fd-4952-a15c-9b981c7f3239",
"62daecef-2eb8-48c6-948e-73f4bafb4a33",
"926b8e0d-2e1a-42a9-a33c-ff23efbb8ed8",
"30bf62fa-bc4a-4700-a006-d3de40376155"
];

const c=new Client({connectionString:process.env.DATABASE_URL});
await c.connect();
await c.query("BEGIN");
try{
  const pre=await c.query(`
    select q.id,q.status,q.question_set_id,qs.title
    from questions q join question_sets qs on qs.id=q.question_set_id
    where q.question_set_id=any($1::uuid[])
    order by qs.title,q.id
  `,[setIds]);

  if(pre.rowCount!==45) throw new Error(`Expected exactly 45 target rows, found ${pre.rowCount}`);
  const bad=pre.rows.filter(r=>r.status!=="draft");
  if(bad.length) throw new Error(`Expected all 45 targets to be draft; found ${bad.length} non-draft`);

  const u=await c.query(`
    update questions
    set status='published',
        reviewed_at=now(),
        updated_at=now(),
        review_notes=coalesce(review_notes,'') ||
          E'\n[reading-round2-final-review-2026-10-05] Combined 45-question Round 2 review passed; approved and published by explicit user authorization.'
    where question_set_id=any($1::uuid[]) and status='draft'
    returning id
  `,[setIds]);

  if(u.rowCount!==45) throw new Error(`Expected 45 updates, got ${u.rowCount}`);
  await c.query("COMMIT");

  const total=await c.query(`
    select count(*)::int n
    from questions
    where section_key='reading' and status='published'
  `);
  const byTopic=await c.query(`
    select t.slug topic,t.name,count(*)::int n
    from questions q join act_topics t on t.id=q.topic_id
    where q.section_key='reading' and q.status='published'
    group by t.slug,t.name
    order by t.slug
  `);
  const drafts=await c.query(`
    select count(*)::int n
    from questions
    where section_key='reading' and status='draft'
  `);

  console.log(JSON.stringify({
    publishedNow:u.rowCount,
    totalReadingPublished:total.rows[0].n,
    publishedByTopic:byTopic.rows,
    remainingReadingDrafts:drafts.rows[0].n
  },null,2));
}catch(e){
  await c.query("ROLLBACK");
  throw e;
}
await c.end();