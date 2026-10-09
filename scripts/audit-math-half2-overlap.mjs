import fs from 'node:fs'; import pg from 'pg'; import {reviewQuestionQuality} from '../lib/question-utils.ts';
const {Client}=pg;
const files=[['gemini_r1','tmp_r1_gemini.json'],['gemini_r2','tmp_r2_gemini.json'],['claude_r2','tmp_r2_claude.json']];
const cand=[]; for(const [label,file] of files){const x=JSON.parse(fs.readFileSync(file,'utf8'));x.questions.forEach((q,i)=>cand.push({...q,label,key:label+'#'+(i+1)}));}
const c=new Client({connectionString:process.env.DATABASE_URL}); await c.connect();
const existing=(await c.query(`select q.id,q.prompt,q.difficulty,q.status,t.slug topic from questions q join act_topics t on t.id=q.topic_id where q.section_key='math' and q.status in ('published','draft')`)).rows;
const topics=new Map((await c.query("select slug,name from act_topics where section_key='math' and is_active=true")).rows.map(x=>[x.slug,x.name]));
await c.end();
const stop=new Set('a an the of to and or is are be for in on at from with by what which if then this that these those value values following does do how many much when where all real number numbers units unit given below above'.split(/\s+/));
function toks(s,{nums=false}={}){s=String(s).toLowerCase().replace(/[−–—]/g,'-').replace(/\d+(?:\.\d+)?/g,nums?' # ':' ').replace(/[^a-z#]+/g,' ');return s.split(/\s+/).filter(x=>x&&!stop.has(x));}
function jac(a,b){const A=new Set(a),B=new Set(b);let i=0;for(const x of A)if(B.has(x))i++;return i/(A.size+B.size-i||1)}
function sim(a,b){return Math.max(jac(toks(a),toks(b)),jac(toks(a,{nums:true}),toks(b,{nums:true})))}
const flags=[];
for(let i=0;i<cand.length;i++){
 const q=cand[i];
 const qr=reviewQuestionQuality({id:q.key,section:'math',topic:topics.get(q.topic),difficulty:q.difficulty,passage:'',question_text:q.question_text,choices:q.choices,correct_answer:q.correct_answer,explanation:q.explanation});
 if(qr.blockingFlags.length||qr.warningFlags.length) flags.push({kind:'quality',a:q.key,topic:q.topic,blocking:qr.blockingFlags,warning:qr.warningFlags,pa:q.question_text});
 for(let j=i+1;j<cand.length;j++){if(q.topic!==cand[j].topic)continue;const s=sim(q.question_text,cand[j].question_text);if(s>=0.46)flags.push({kind:'candidate',score:+s.toFixed(3),a:q.key,b:cand[j].key,topic:q.topic,pa:q.question_text,pb:cand[j].question_text});}
 for(const e of existing){if(q.topic!==e.topic)continue;const s=sim(q.question_text,e.prompt);if(s>=0.46)flags.push({kind:'existing',score:+s.toFixed(3),a:q.key,b:e.id,status:e.status,topic:q.topic,pa:q.question_text,pb:e.prompt});}
}
flags.sort((a,b)=>(b.score||0)-(a.score||0));
console.log(JSON.stringify({candidateCount:cand.length,existingCount:existing.length,flagCount:flags.length,flags:flags.slice(0,220)},null,2));
