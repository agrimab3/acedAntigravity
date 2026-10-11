import test from 'node:test';
import assert from 'node:assert/strict';
import {runTutorFallbackChain,TUTOR_GEMINI_MODELS} from '../lib/tutor-fallback-chain.mjs';
const options={systemInstruction:'hint only',prompt:'help'};
for(let successes=0;successes<4;successes++)test('tutor uses Gemini fallback '+(successes+1),async()=>{
 const seen:string[]=[];
 const result=await runTutorFallbackChain(options,{gemini:async(model:string)=>{seen.push(model);if(seen.length<=successes)throw new Error('429');return 'A helpful hint';}});
 assert.equal(result.model,TUTOR_GEMINI_MODELS[successes]);assert.deepEqual(seen,TUTOR_GEMINI_MODELS.slice(0,successes+1));
});
test('tutor tries Groq after all four Gemini failures',async()=>{
 const seen:string[]=[];const result=await runTutorFallbackChain(options,{gemini:async(model:string)=>{seen.push(model);throw Error('503')},groq:async()=> 'Groq hint'});
 assert.equal(result.provider,'groq');assert.deepEqual(seen,TUTOR_GEMINI_MODELS);
});
test('tutor fails gracefully when all providers fail',async()=>{
 await assert.rejects(runTutorFallbackChain(options,{gemini:async()=>{throw Error('429')},groq:async()=>{throw Error('503')}}),/providers unavailable/);
});
