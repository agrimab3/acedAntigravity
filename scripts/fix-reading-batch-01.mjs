import { Client } from "pg";
import { createHash } from "node:crypto";

const questionId="f88aa59d-8df2-4b27-8e70-1b80eb8161ca";
const c=new Client({connectionString:process.env.DATABASE_URL});
await c.connect();

const choices={
  A:"The result would support the idea that benches themselves raise the chance of encounters, consistent with the gains on unrequested blocks.",
  B:"The result would show that benches have no real effect, because the increase in conversations was only modest.",
  C:"The result would prove that neighborhood associations play no role in how sociable a block becomes.",
  D:"The result would confirm that benches are only a symptom of neighborliness rather than a cause of it."
};

await c.query("BEGIN");
try{
  const before=await c.query(`
    select q.id,q.section_key,q.difficulty,q.prompt,q.choices,q.fingerprint,
           t.slug topic_slug,qs.content stimulus
    from questions q
    join act_topics t on t.id=q.topic_id
    left join question_sets qs on qs.id=q.question_set_id
    where q.id=$1 and q.status='draft'
  `,[questionId]);
  if(before.rowCount!==1) throw new Error("Expected one draft question.");

  const r=before.rows[0];
  const norm=v=>String(v??"").replace(/\s+/g," ").trim().toLowerCase();
  const canonical=["A","B","C","D"].map(k=>`${k}:${norm(choices[k])}`).join("|");
  const fingerprint=createHash("sha256").update([
    r.section_key,r.topic_slug,r.difficulty,norm(r.stimulus||""),norm(r.prompt),canonical
  ].join("||")).digest("hex");

  const collision=await c.query("select id from questions where fingerprint=$1 and id<>$2",[fingerprint,questionId]);
  if(collision.rowCount) throw new Error("Fingerprint collision.");

  await c.query(`
    update questions
    set choices=$1::jsonb,fingerprint=$2,updated_at=now(),
        review_notes=coalesce(review_notes,'') || E'\n[reading-review-2026-10-05] Reworded hard-item choices for grammatical alignment with the revised inference stem.'
    where id=$3
  `,[JSON.stringify(choices),fingerprint,questionId]);

  await c.query("COMMIT");
  console.log(JSON.stringify({updated:questionId,fingerprint},null,2));
}catch(e){await c.query("ROLLBACK");throw e}
await c.end();