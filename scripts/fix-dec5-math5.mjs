import pg from 'pg';
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required');
const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();
const old='Which value of x gives the greatest volume for 0 < x < 10?';
const revised='Of the following values of x, which gives the greatest volume for 0 < x < 10?';
try{
 await c.query('BEGIN');
 const r=await c.query(`select f.id form_id,f.status,q.id question_id,q.prompt from mock_test_form_questions fq join mock_test_forms f on f.id=fq.form_id join mock_tests mt on mt.id=f.mock_test_id join questions q on q.id=fq.question_id where mt.slug=$1 and f.version='A' and fq.section_key='math' and fq.position=5 for update of f,q`,['2026-12-05']);
 if(r.rowCount!==1)throw Error('Math 5 not found exactly once');const row=r.rows[0];
 if(row.status!=='locked')throw Error('Form not locked at start');
 if(!row.prompt.includes(old)&&!row.prompt.includes(revised))throw Error('Unexpected Math 5 wording');
 await c.query(`update mock_test_forms set status='review', locked_at=null, locked_by_user_id=null where id=$1 and status='locked'`,[row.form_id]);
 if(row.prompt.includes(old))await c.query('update questions set prompt=$1 where id=$2',[row.prompt.replace(old,revised),row.question_id]);
 await c.query(`update mock_test_forms set status='locked' where id=$1 and status='review'`,[row.form_id]);
 const check=await c.query('select f.status,q.prompt from mock_test_forms f join mock_test_form_questions fq on fq.form_id=f.id join questions q on q.id=fq.question_id where f.id=$1 and fq.section_key=$2 and fq.position=5',[row.form_id,'math']);
 if(check.rows[0]?.status!=='locked'||!check.rows[0]?.prompt.includes(revised))throw Error('Postcondition failed');
 await c.query('COMMIT');console.log('Math 5 revised and Form A re-locked; verified');
}catch(e){await c.query('ROLLBACK');console.error(e.message);process.exitCode=1}finally{await c.end()}
