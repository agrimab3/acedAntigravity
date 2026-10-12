import fs from 'node:fs';
import crypto from 'node:crypto';
const path='docs/dec5-reviewed-form.json';
const form=JSON.parse(fs.readFileSync(path,'utf8'));
const tags=JSON.parse(fs.readFileSync('docs/dec5-question-tags.json','utf8'));
const original=new Map(form.questions.map(q=>[q.id,JSON.stringify({...q,topic_id:null})]));
const topics=new Map(form.topics.map(t=>[`${t.section_key}|${t.name}`,t]));
for(const [section,total] of [['english',50],['reading',36]]){
 const rows=tags[section];if(rows.length!==total||new Set(rows.map(r=>r.q)).size!==total)throw Error('Bad tag coverage: '+section);
 for(let position=1;position<=total;position++){
  const tag=rows.find(t=>t.q===position);if(!tag?.category||!tag.skill||(section==='reading'&&!tag.genre))throw Error('Missing tags '+section+position);
  const order=form.order.find(o=>o.section_key===section&&o.position===position);
  const q=form.questions.find(q=>q.id===order?.question_id);if(!q)throw Error('Missing question '+section+position);
  const name=section==='reading'?`${tag.genre} / ${tag.category} / ${tag.skill}`:`${tag.category} / ${tag.skill}`;
  const key=`${section}|${name}`;
  let topic=topics.get(key);
  if(!topic){
   const hash=crypto.createHash('sha256').update('aced-dec5-tag:'+key).digest('hex');
   const id=`${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
   topic={id,section_key:section,slug:'dec5-tag-'+hash.slice(0,24),name,display_order:1000+topics.size,is_active:true};
   form.topics.push(topic);topics.set(key,topic);
  }
  q.topic_id=topic.id;
 }
}
for(const q of form.questions)if(JSON.stringify({...q,topic_id:null})!==original.get(q.id))throw Error('Question content changed');
const qById=new Map(form.questions.map(q=>[q.id,q]));
const canonical=form.order.map(o=>{const q=qById.get(o.question_id);return {section:o.section_key,position:o.position,question:q.id,prompt:q.prompt,passage:q.passage,choices:q.choices,answer:q.correct_answer,explanation:q.explanation,set:q.question_set_id,topic:q.topic_id}});
const old=form.checksum;
form.checksum=crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
fs.writeFileSync(path,JSON.stringify(form,null,2)+'\n');
console.log(JSON.stringify({oldChecksum:old,newChecksum:form.checksum,english:50,reading:36,newTopics:form.topics.length}));
