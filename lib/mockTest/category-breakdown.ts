export type TopicResultRow = {sectionKey:string;topicId:string;topicName:string;correct:number;total:number};
const CATEGORIES:Record<string,readonly string[]>={
 english:['Conventions of Standard English','Knowledge of Language','Production of Writing'],
 reading:['Key Ideas and Details','Craft and Structure','Integration of Knowledge and Ideas'],
 science:['Interpretation of Data','Scientific Investigation','Evaluation of Models, Inferences, and Experimental Results'],
};
export function groupTopicResults(rows:TopicResultRow[]){
 const groups=new Map<string,{sectionKey:string;topicId:string;topicName:string;correct:number;total:number;accuracyPct:number;skills:{name:string;correct:number;total:number}[]}>();
 for(const row of rows){
  const parts=row.topicName.split(' / ');
  const category=CATEGORIES[row.sectionKey]?.find(c=>parts.includes(c))??row.topicName;
  const skill=category===row.topicName?'':parts.slice(parts.indexOf(category)+1).join(' / ');
  const key=row.sectionKey+'|'+category;
  let group=groups.get(key);
  if(!group){group={sectionKey:row.sectionKey,topicId:key,topicName:category,correct:0,total:0,accuracyPct:0,skills:[]};groups.set(key,group);}
  group.correct+=Number(row.correct);group.total+=Number(row.total);
  if(skill)group.skills.push({name:skill,correct:Number(row.correct),total:Number(row.total)});
 }
 return [...groups.values()].map(group=>({...group,accuracyPct:group.total?Math.round(group.correct/group.total*100):0,skills:group.skills.sort((a,b)=>a.name.localeCompare(b.name))})).sort((a,b)=>a.sectionKey.localeCompare(b.sectionKey)||a.accuracyPct-b.accuracyPct||b.total-a.total);
}
