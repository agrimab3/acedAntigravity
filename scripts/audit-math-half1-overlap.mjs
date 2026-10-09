import fs from 'node:fs';
import pg from 'pg';
const {Client}=pg;
const files=[['claude_r1','tmp_r1_claude.json'],['chatgpt_r1','tmp_r1_chatgpt.json'],['chatgpt_r2','tmp_r2_chatgpt.json']];
const cand=[];
for(const [source,file] of files){
 const obj=JSON.parse(fs.readFileSync(file,'utf8'));
 obj.questions.forEach((q,i)=>cand.push({...q,source,source_index:i+1,key:source+'#'+(i+1)}));
}
const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
const pub=(await c.query(`select q.id,q.prompt,q.difficulty,t.slug topic from questions q join act_topics t on t.id=q.topic_id where q.section_key='math' and q.status='published'`)).rows;
await c.end();
const stop=new Set('a an the of to and or is are be for in on at from with by what which if then this that these those value values following does do how many much when where all real number numbers units unit given below above'.split(/\s+/));
function toks(s,{nums=false}={}){
 s=String(s).toLowerCase().replace(/[−–—]/g,'-').replace(/\d+(?:\.\d+)?/g,nums?' # ':' ').replace(/[^a-z#]+/g,' ');
 return s.split(/\s+/).filter(x=>x && !stop.has(x));
}
function jac(a,b){
 const A=new Set(a),B=new Set(b); let i=0; for(const x of A) if(B.has(x)) i++; return i/(A.size+B.size-i||1);
}
function sim(a,b){
 return Math.max(jac(toks(a),toks(b)), jac(toks(a,{nums:true}),toks(b,{nums:true})));
}
const flags=[];
for(let i=0;i<cand.length;i++){
 for(let j=i+1;j<cand.length;j++){
  if(cand[i].topic!==cand[j].topic) continue;
  const s=sim(cand[i].question_text,cand[j].question_text);
  if(s>=0.48) flags.push({kind:'candidate',score:+s.toFixed(3),a:cand[i].key,b:cand[j].key,topic:cand[i].topic,pa:cand[i].question_text,pb:cand[j].question_text});
 }
 for(const p of pub){
  if(cand[i].topic!==p.topic) continue;
  const s=sim(cand[i].question_text,p.prompt);
  if(s>=0.48) flags.push({kind:'published',score:+s.toFixed(3),a:cand[i].key,b:p.id,topic:cand[i].topic,pa:cand[i].question_text,pb:p.prompt});
 }
}
flags.sort((x,y)=>y.score-x.score);
console.log(JSON.stringify({candidateCount:cand.length,publishedCount:pub.length,flagCount:flags.length,flags:flags.slice(0,120)},null,2));
