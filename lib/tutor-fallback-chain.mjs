import {resolvePreferredGroqModel,resolveGroqFallbackModel} from './groq-models.ts';
export const TUTOR_GEMINI_MODELS = ["gemini-3.1-flash-lite-preview", "gemini-2.5-flash", "gemini-3-flash-preview", "gemini-2.5-flash-lite"];
export async function runTutorFallbackChain(options,runners){
 const failures=[];
 if(runners.gemini)for(const model of TUTOR_GEMINI_MODELS){
  try{const text=(await runners.gemini(model,options)).trim();if(!text)throw Error('empty');console.info('[tutor-model]',JSON.stringify({provider:'gemini',model}));return {text,provider:'gemini',model};}
  catch{failures.push(model)}
 }
 if(runners.groq){const preferred=resolvePreferredGroqModel(process.env.GROQ_MODEL);for(const model of new Set([preferred,resolveGroqFallbackModel(preferred)])){
  try{const text=(await runners.groq(model,options)).trim();if(!text)throw Error('empty');console.info('[tutor-model]',JSON.stringify({provider:'groq',model}));return {text,provider:'groq',model};}
  catch{failures.push(model)}
 }}
 throw Error(`Tutor AI providers unavailable (${failures.length} attempts)`);
}
