import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';import {groupTopicResults} from '../lib/mockTest/category-breakdown.ts';
test('English, Reading and Science collapse skills into three categories each',()=>{
 const tags=JSON.parse(fs.readFileSync('docs/dec5-question-tags.json','utf8'));
 const rows=[];
 for(const section of ['english','reading','science'])for(const tag of tags[section])rows.push({sectionKey:section,topicId:section+tag.q,topicName:(section==='reading'?tag.genre+' / ':'')+tag.category+' / '+tag.skill,correct:1,total:1});
 const result=groupTopicResults(rows);
 for(const [section,count] of [['english',50],['reading',36],['science',40]]){
  const groups=result.filter(r=>r.sectionKey===section);assert.equal(groups.length,3);assert.equal(groups.reduce((s,r)=>s+r.total,0),count);assert.ok(groups.every(r=>r.skills.length>0&&!r.topicName.includes(' / ')));
 }
});
