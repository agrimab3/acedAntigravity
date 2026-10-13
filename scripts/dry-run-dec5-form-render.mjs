// Renders all published Form A passage questions through the admin preview component, without registration.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const payload=JSON.parse(fs.readFileSync('docs/dec5-reviewed-form.json','utf8'));
const byId=new Map(payload.questions.map(q=>[q.id,q]));
const tmp=path.resolve('scripts/.dec5-preview-bundle.mjs');
try{
 await build({entryPoints:['app/admin/mock-test/reserve-preview/preview-client.tsx'],outfile:tmp,bundle:true,platform:'node',format:'esm',target:'node22',external:['react','react-dom'],plugins:[{name:'css-module-stub',setup(build){build.onResolve({filter:/\.module\.css$/},args=>({path:args.path,namespace:'css-stub'}));build.onLoad({filter:/.*/,namespace:'css-stub'},()=>({contents:'export default new Proxy({}, {get:(_,key)=>String(key)});',loader:'js'}));}}],logLevel:'silent'});
 const {default:Preview}=await import(pathToFileURL(tmp).href);
 let rendered=0;
 const counts={english:0,reading:0,science:0};
 for(const section of ['english','reading','science']){
  const orders=payload.order.filter(o=>o.section_key===section);
  const expected=section==='english'?50:section==='reading'?36:40;
  if(orders.length!==expected)throw Error('Unexpected '+section+' count');
  for(const {position,question_id} of orders){
   const q=byId.get(question_id);
   if(!q||q.status!=='published'||q.usage_scope!=='mock_reserve')throw Error('Invalid question '+section+' '+position);
   const ordinal=(position-1)%(section==='english'?10:9)+1;
   const notes=typeof q.review_notes==='string'?JSON.parse(q.review_notes):q.review_notes;
   const passageNumber=section==='science'?String(notes?.passageNumber??''):Math.ceil(position/(section==='english'?10:9));
   const html=renderToStaticMarkup(React.createElement(Preview,{section,title:String(notes?.passageTitle??''),prompt:q.prompt,passage:q.passage,choices:q.choices,difficulty:q.difficulty,number:position,ordinal,passageNumber,total:expected}));
   if(!html.includes('question')||!html.includes(String(position))||!html.includes('type="radio"'))throw Error('Question UI failed '+section+' '+position);
   for(const choice of ['A','B','C','D'])if(!html.includes('>'+choice+'</strong>'))throw Error('Missing choice '+section+' '+position+' '+choice);
   if(section==='reading'&&!html.includes('class="line"'))throw Error('Missing Reading line rendering '+position);
   if(section==='english'&&!html.includes('class="paragraphLabel"'))throw Error('Missing English paragraph labels '+position);
   if(section==='science'&&q.passage.includes('**Table ')&&(!html.includes('<table')||!html.includes('Table ')))throw Error('Missing Science table rendering '+position);
   rendered++;counts[section]++;
  }
 }
 console.log(JSON.stringify({rendered,counts,method:'server-rendered actual admin preview React components',registrationCreated:false,answersSaved:false}));
}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}
