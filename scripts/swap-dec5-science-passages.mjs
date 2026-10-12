import fs from 'node:fs';import crypto from 'node:crypto';
const file='docs/dec5-reviewed-form.json';const form=JSON.parse(fs.readFileSync(file,'utf8'));
const drafts=JSON.parse(fs.readFileSync('/tmp/aced-science-draft-export.json','utf8'));
const tags=JSON.parse(fs.readFileSync('docs/dec5-question-tags.json','utf8')).science;
const source=JSON.parse(fs.readFileSync('docs/science-passages-review.json','utf8'));
if(drafts.length!==40||tags.length!==40||source.length!==6)throw Error('Invalid Science input');
const originalMath=form.order.filter(o=>o.section_key==='math');const originalScience=form.order.filter(o=>o.section_key==='science');
if(originalMath.length!==45||originalScience.length!==40)throw Error('Unexpected form');
const old=form.checksum;
const topics=new Map(form.topics.map(t=>[t.section_key+'|'+t.name,t]));
const topicFor=(tag)=>{
 const name=tag.category+' / '+tag.skill;const key='science|'+name;
 let topic=topics.get(key);
 if(!topic){const hash=crypto.createHash('sha256').update('aced-dec5-tag:'+key).digest('hex');const id=`${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;topic={id,section_key:'science',slug:'dec5-tag-'+hash.slice(0,24),name,display_order:1000+topics.size,is_active:true};topics.set(key,topic);form.topics.push(topic);}
 return topic;
};
const sets=new Map(form.sets.map(s=>[s.id,s]));
const oldScienceIds=new Set(originalScience.map(o=>o.question_id));
form.questions=form.questions.filter(q=>!oldScienceIds.has(q.id));
for(let i=0;i<40;i++){
 const row=drafts[i],tag=tags[i],qnum=i+1;
 if(tag.q!==qnum||Number(JSON.parse(row.review_notes).questionNumber)!==qnum||row.status!=='draft'||row.usage_scope!=='mock_reserve')throw Error('Science draft/tag mismatch '+qnum);
 const item=source.find(x=>x.questions.some(q=>q.number===qnum));if(!item||row.prompt!==item.questions.find(q=>q.number===qnum).prompt||row.passage!==item.passage)throw Error('Source text mismatch '+qnum);
 const topic=topicFor(tag);
 const question={...row};for(const key of ['set_id','set_kind','set_title','set_content','set_metadata','set_topic_id','set_created_at','set_updated_at'])delete question[key];
 question.topic_id=topic.id;question.status='published';question.usage_scope='mock_reserve';question.review_notes=JSON.stringify({...JSON.parse(row.review_notes),category:tag.category,skill:tag.skill,passageType:tag.passage_type});
 form.questions.push(question);
 const set={id:row.set_id,section_key:'science',topic_id:topic.id,kind:row.set_kind,title:row.set_title,content:row.set_content,metadata:row.set_metadata,created_at:row.set_created_at,updated_at:row.set_updated_at};
 if(!sets.has(set.id)){form.sets.push(set);sets.set(set.id,set);}
 const slot=form.order.find(o=>o.section_key==='science'&&o.position===qnum);slot.question_id=question.id;
}
if(JSON.stringify(form.order.filter(o=>o.section_key==='math'))!==JSON.stringify(originalMath))throw Error('Math order changed');
const byId=new Map(form.questions.map(q=>[q.id,q]));
const canonical=form.order.map(o=>{const q=byId.get(o.question_id);if(!q)throw Error('Missing question '+o.question_id);return {section:o.section_key,position:o.position,question:q.id,prompt:q.prompt,passage:q.passage,choices:q.choices,answer:q.correct_answer,explanation:q.explanation,set:q.question_set_id,topic:q.topic_id}});
form.checksum=crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
fs.writeFileSync(file,JSON.stringify(form,null,2)+'\n');console.log(JSON.stringify({oldChecksum:old,newChecksum:form.checksum,science:40,mathUnchanged:45,topics:form.topics.length}));
