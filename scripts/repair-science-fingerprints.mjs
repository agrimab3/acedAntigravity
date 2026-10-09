import { Client } from "pg";
import { createHash } from "node:crypto";

const ANSWERS=["A","B","C","D"];
const norm=(v="")=>String(v??"").replace(/\s+/g," ").trim().toLowerCase();
const makeFp=(r)=>{
  const canonicalChoices=ANSWERS.map(k=>`${k}:${norm(r.choices[k])}`).join("|");
  return createHash("sha256").update([
    r.section_key,r.topic_slug,r.difficulty,norm(r.stimulus||""),norm(r.prompt),canonicalChoices
  ].join("||")).digest("hex");
};

const c=new Client({connectionString:process.env.DATABASE_URL});
await c.connect();

const {rows}=await c.query(`
  select q.id,q.section_key,q.difficulty,q.prompt,q.choices,q.fingerprint,
         t.slug topic_slug,qs.content stimulus
  from questions q
  join act_topics t on t.id=q.topic_id
  left join question_sets qs on qs.id=q.question_set_id
  where q.section_key='science' and q.status='published'
`);

const stale=rows.map(r=>({...r,expected:makeFp(r)})).filter(r=>r.fingerprint!==r.expected);
if(stale.length!==13) throw new Error(`Expected 13 stale fingerprints from audit, found ${stale.length}`);

const expected=stale.map(r=>r.expected);
const collision=await c.query(
  "select id,fingerprint from questions where fingerprint=any($1::text[]) and not (id=any($2::uuid[]))",
  [expected,stale.map(r=>r.id)]
);
if(collision.rowCount) throw new Error("Fingerprint collision: "+JSON.stringify(collision.rows));

await c.query("BEGIN");
try{
  for(const r of stale) await c.query("update questions set fingerprint=$1, updated_at=now() where id=$2",[r.expected,r.id]);
  await c.query("COMMIT");
}catch(e){await c.query("ROLLBACK");throw e}

console.log(JSON.stringify({updated:stale.length,ids:stale.map(r=>r.id)},null,2));
await c.end();