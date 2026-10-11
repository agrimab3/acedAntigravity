/** Owner-reviewed reserve-only English passage generation. Never assigns a live form. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import {authoredPassages} from './authored-english-passages.mjs';
const topics=[['The Night Garden','A community creates a garden for nocturnal pollinators'],['The Last Mapmaker','A cartographer records changing coastal wetlands'],['A Library of Sounds','A museum preserves the sounds of everyday machines'],['The Bridge of Paper','Students engineer a temporary bridge from recycled paper'],['Seeds on the Roof','A school studies the cooling effect of a rooftop garden']];
const out='docs/english-passages-review.json';
const existing=fs.existsSync(out)?JSON.parse(fs.readFileSync(out,'utf8')):[];
const key=process.env.CONTENT_FACTORY_GEMINI_API_KEY;

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function gemini(model,prompt){
 const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
 const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature:0.5,maxOutputTokens:8500}})});
 const json=await response.json();if(!response.ok)throw Error(`Gemini ${model} HTTP ${response.status}: ${String(json.error?.message||'provider error').slice(0,200)}`);
 const raw=json.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
 return JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,''));
}
function check(item){
 if(typeof item.passage!=='string'||!Array.isArray(item.questions)||item.questions.length!==10)throw Error('Expected passage and exactly 10 questions');
 const words=item.passage.replace(/\[\/?underline\]/g,'').trim().split(/\s+/).length;
 if(words<300||words>400)throw Error(`Passage length ${words} outside 300–400`);
 const matches=[...item.passage.matchAll(/\[underline\]([\s\S]*?)\[\/underline\]/g)];if((item.passage.match(/\[underline\]/g)||[]).length!==10 || (item.passage.match(/\[\/underline\]/g)||[]).length!==10 || matches.length!==10)throw Error(`Expected 10 numbered underlines, found ${matches.length}`);
 const difficulties={easy:0,medium:0,hard:0};
 for(let i=0;i<10;i++){
  const q=item.questions[i];if(q.number!==i+1)throw Error(`Bad question number ${i+1}`);
  if(!['easy','medium','hard'].includes(q.difficulty))throw Error('Bad difficulty');difficulties[q.difficulty]++;
  if(!q.prompt||!q.explanation||!['A','B','C','D'].includes(q.answer)||!q.choices||['A','B','C','D'].some(c=>!q.choices[c]))throw Error(`Invalid answer or explanation Q${i+1}`);
  const normalized=['A','B','C','D'].map(c=>q.choices[c].trim().toLowerCase());if(new Set(normalized).size!==4)throw Error(`Duplicate choices Q${i+1}`);
  if(!matches[i][1].trim())throw Error(`Empty underline Q${i+1}`);
 }
 if(difficulties.easy!==3||difficulties.medium!==5||difficulties.hard!==2)throw Error('Difficulty distribution not 3/5/2');
 return {words,difficulties};
}
function save(){fs.writeFileSync(out,JSON.stringify(existing,null,2));const md=['# Five ACT-style English passages — owner review only','','**Status:** Draft mock reserve; not in the locked December 5 Form A. Answers below are for reviewer use only.',''];for(const item of existing){md.push(`## ${item.title}`,'',`Word count: ${item.words}. AI review: ${item.aiReview?.verdict||'not completed'}.`,'',item.passage.replaceAll('[underline]','<u>').replaceAll('[/underline]','</u>'),'');for(const q of item.questions){md.push(`### ${q.number}. ${q.prompt}`,'',...['A','B','C','D'].map(c=>`- ${c}. ${q.choices[c]}`),'',`**Answer: ${q.answer}** · ${q.difficulty} · ${q.skill}`,'',`Explanation: ${q.explanation}`,'');}md.push('---','');}fs.writeFileSync('docs/english-passages-review.md',md.join('\n'));}
for (const authored of authoredPassages) {
 if (existing.some(x=>x.title===authored.title)) continue;
 const item={title:authored.title,passage:authored.passage,questions:authored.questions.map((q,i)=>{
  const [skill,prompt,correct,wrong1,wrong2,wrong3,explanation]=q;
  const options=[correct,wrong1,wrong2,wrong3];
  const shift=i%4;
  const rotated=[...options.slice(shift),...options.slice(0,shift)];
  return {number:i+1,difficulty:i<3?'easy':i<8?'medium':'hard',skill,prompt,choices:Object.fromEntries('ABCD'.split('').map((letter,j)=>[letter,rotated[j]])),answer:'ABCD'[(4-shift)%4],explanation};
 })};
 const validation=check(item);
 item.words=validation.words;
 item.model='human-authored';
 item.reviewModel='gemini-2.5-flash';
 item.aiReview={verdict:'pending',summary:'Human-authored and structurally validated; AI review pending.'};
 if(key){
  try{
   const review=await gemini('gemini-2.5-flash',`Review the following original ACT-style English passage and all 10 questions. Check answer correctness, unique best answers, grammatical validity, and alignment to numbered underlines. Return JSON with verdict pass or fail, issues array, and summary. ${JSON.stringify(item)}`);
   item.aiReview=review.verdict==='pass' && !(review.issues||[]).length?review:{verdict:'pending',issues:review.issues||[],summary:'AI flagged issues; owner review required.'};
  }catch(e){console.log(JSON.stringify({title:item.title,review:'pending',reason:String(e.message).replace(/AIza[\w-]+/g,'[REDACTED]').slice(0,160)}));}
 }
 existing.push(item);save();console.log(JSON.stringify({title:item.title,status:'draft_ready',words:item.words,questions:10,review:item.aiReview.verdict}));
}
if (process.argv.includes('--review-pending')) {
 for(const item of existing.filter(x=>x.aiReview?.verdict==='pending')) {
  if(!key){console.log(JSON.stringify({title:item.title,review:'pending',reason:'Review API key unavailable'}));break;}
  try{
   const result=await gemini('gemini-2.5-flash',`Review each of these ten English editing questions for a unique correct answer, correct key, and alignment with its numbered underline. Return JSON {"verdict":"pass" or "fail","issues":[],"summary":"..."}. ${JSON.stringify(item)}`);
   item.aiReview=result.verdict==='pass' && !(result.issues||[]).length?result:{verdict:'pending',issues:result.issues||[],summary:'AI flagged issues; human review required.'};
   console.log(JSON.stringify({title:item.title,review:item.aiReview.verdict}));save();
  }catch(e){console.log(JSON.stringify({title:item.title,review:'pending',reason:String(e.message).replace(/AIza[\w-]+/g,'[REDACTED]').slice(0,160)}));break;}
 }
}
if(process.argv.includes('--insert')&&existing.length){
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL missing');const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
 try{await db.query('BEGIN');const topicsRows=(await db.query("select id from act_topics where section_key='english' and is_active=true order by display_order limit 1")).rows;if(!topicsRows.length)throw Error('No English topic');const topicId=topicsRows[0].id;
 for(const item of existing){const groupId=crypto.createHash('sha256').update('english-longpassage:'+item.title).digest('hex').slice(0,24);for(const q of item.questions){const fp=crypto.createHash('sha256').update(`mock-longpassage-v1:${item.title}:${q.number}`).digest('hex');const id=crypto.randomUUID();await db.query(`insert into questions (id,section_key,topic_id,difficulty,question_type,prompt,passage,choices,correct_answer,explanation,source,status,fingerprint,usage_scope,review_notes) values ($1,'english',$2,$3,'multiple_choice',$4,$5,$6,$7,$8,$9,'draft',$10,'mock_reserve',$11) on conflict (fingerprint) do nothing`,[id,topicId,q.difficulty,q.prompt,item.passage,JSON.stringify(q.choices),q.answer,q.explanation,'english-longpassage:'+groupId,fp,JSON.stringify({aiReview:item.aiReview,skill:q.skill,passageTitle:item.title})]);}}
 await db.query('COMMIT');console.log(JSON.stringify({insertedPassages:existing.length,scope:'mock_reserve',status:'draft',lockedForm:'untouched'}));
 }catch(e){await db.query('ROLLBACK');throw e}finally{await db.end()}
}
