import { Client } from "pg";
import { createHash } from "crypto";

const edits={
  "b856dafe-6eaf-4a26-b206-2501d0550906":{
    marker:"Mara is careful not to treat the maps as automatically more truthful than the office's existing surveys.",
    addition:"A third group deepens that lesson. Several residents draw two very different routes to the same job-training center: a direct trip they use in the afternoon and a longer trip they prefer in the morning because a missed connection on the direct route can cause a long delay. The official map represents both routes accurately, but it does not show why travelers may judge the less direct option as more dependable. For Mara, the contrast is another reminder that a network can be geographically clear while still being experienced in more complicated ways.\n\n"
  },
  "562aa20b-0fc2-4dbc-9166-3315607f7ad4":{
    marker:"Some critics resist giving performers so much interpretive responsibility.",
    addition:"In rehearsal, this difference is often easiest to hear when the surrounding notes stay unchanged. A performer may try the same pause several times: once with strict regularity, once after a slight slowing, and once with a firmer attack on the note before it. None of these versions requires adding notes or ignoring the written rest, yet each alters the listener's sense of whether the silence closes a thought, suspends it, or prepares something new. The experiment makes interpretation audible without turning the score into a loose suggestion.\n\n"
  },
  "bc9dd8e3-379b-4bac-9243-41d587cc7f81":{
    marker:"This mechanism is astonishingly efficient.",
    addition:"The important point is not simply that a more open structure is always better. The observed vortex depends on a particular balance: enough open space for air to pass through the pappus, but enough interaction among neighboring bristles to organize that flow. Changing the spacing too far in either direction can weaken the pattern that makes the structure so effective.\n\n"
  },
  "0c91399c-d139-43eb-989d-76690c8b721b":{
    marker:"At the same time, ecologists caution against treating every difference between patches as evidence that organisms are reshaping their own environment.",
    addition:"The influence of earlier communities can also persist after those communities are no longer obvious. Decaying roots, accumulated plant material, and changes in shade or soil moisture can leave conditions different from those on nearby ground that looks similar at first glance. Later arrivals therefore respond not only to the climate of the moment but also to conditions partly inherited from what occupied the site before. Such legacies need not determine a single outcome, but they can make two apparently comparable patches diverge over time.\n\n"
  }
};

const norm=v=>String(v||"").replace(/\s+/g," ").trim().toLowerCase();
function fp({sectionKey,topicSlug,difficulty,passage,prompt,choices}){
  const cc=["A","B","C","D"].map(k=>`${k}:${norm(choices[k])}`).join("|");
  return createHash("sha256").update([sectionKey,topicSlug,difficulty,norm(passage),norm(prompt),cc].join("||")).digest("hex");
}

const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
try{
  await c.query("BEGIN");
  for(const [sid,e] of Object.entries(edits)){
    const s=await c.query("select content from question_sets where id=$1 for update",[sid]);
    if(s.rowCount!==1) throw new Error("missing set "+sid);
    const old=s.rows[0].content;
    if(!old.includes(e.marker)) throw new Error("marker missing "+sid);
    const next=old.replace(e.marker,e.addition+e.marker);
    await c.query("update question_sets set content=$1,updated_at=now() where id=$2",[next,sid]);
    const qs=await c.query(`
      select q.id,q.section_key,q.difficulty,q.prompt,q.choices,t.slug topic_slug
      from questions q join act_topics t on t.id=q.topic_id where q.question_set_id=$1
    `,[sid]);
    for(const q of qs.rows){
      const fingerprint=fp({sectionKey:q.section_key,topicSlug:q.topic_slug,difficulty:q.difficulty,passage:next,prompt:q.prompt,choices:q.choices});
      const col=await c.query("select id from questions where fingerprint=$1 and id<>$2",[fingerprint,q.id]);
      if(col.rowCount) throw new Error("fingerprint collision "+q.id);
      await c.query("update questions set fingerprint=$1,updated_at=now() where id=$2",[fingerprint,q.id]);
    }
  }
  await c.query(`
    update questions
    set explanation='The passage explains that the separated vortex ring depends on a particular balance of porosity and bristle interaction. If the bristles were packed much more closely, that balance would be disrupted, reducing the aerodynamic efficiency that slows the seed''s descent.',
        updated_at=now()
    where id='1a520f6d-44ab-44cd-95a0-53b4cfd7996a'
  `);
  await c.query("COMMIT");
  console.log("round4 passage-length/factual refinements committed");
}catch(e){try{await c.query("ROLLBACK")}catch{};throw e}finally{await c.end()}
