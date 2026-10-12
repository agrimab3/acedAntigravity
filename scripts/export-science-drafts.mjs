import pg from 'pg';import fs from 'node:fs';
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL missing');
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
try{
 const r=await db.query(`select q.*,s.id as set_id,s.kind as set_kind,s.title as set_title,s.content as set_content,s.metadata as set_metadata,s.topic_id as set_topic_id,s.created_at as set_created_at,s.updated_at as set_updated_at from questions q join question_sets s on s.id=q.question_set_id where q.section_key='science' and q.status='draft' and q.usage_scope='mock_reserve' and q.source like 'science-final:%' order by (q.review_notes::jsonb->>'questionNumber')::int`);
 if(r.rows.length!==40)throw Error('Expected 40 science drafts, found '+r.rows.length);
 fs.writeFileSync('/tmp/aced-science-draft-export.json',JSON.stringify(r.rows,null,2));console.log('Exported 40 Science drafts');
}finally{await db.end()}
