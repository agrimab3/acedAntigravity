import {resolvePreferredGroqModel,resolveGroqFallbackModel} from './groq-models.ts';
export async function runTutorFallbackChain(options,runners){
 const failures=[];
 if(runners.groq){const preferred=resolvePreferredGroqModel(process.env.GROQ_MODEL);for(const model of new Set([preferred,resolveGroqFallbackModel(preferred)])){
  try{const text=(await runners.groq(model,options)).trim();if(!text)throw Error('empty');console.info('[tutor-model]',JSON.stringify({provider:'groq',model}));return {text,provider:'groq',model};}
  catch{failures.push(model)}
 }}
 throw Error(`Tutor AI providers unavailable (${failures.length} attempts)`);
}
