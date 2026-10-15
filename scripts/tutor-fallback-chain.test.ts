import test from 'node:test';
import assert from 'node:assert/strict';
import {runTutorFallbackChain} from '../lib/tutor-fallback-chain.mjs';
const options={systemInstruction:'hint only',prompt:'help'};
test('student tutor requests use Groq only and preserve the intended payload',async()=>{
 const seen:string[]=[];
 const runners={gemini:async()=>{throw Error('Gemini must never be called')},groq:async(model:string,input:typeof options)=>{seen.push(model);assert.deepEqual(input,options);return 'Groq hint';}} as unknown as Parameters<typeof runTutorFallbackChain>[1];
 const result=await runTutorFallbackChain(options,runners);
 assert.equal(result.provider,'groq');assert.equal(result.text,'Groq hint');assert.equal(seen.length,1);
});
test('Groq failure does not fall back to Gemini',async()=>{
 let geminiCalled=false;
 const runners={gemini:async()=>{geminiCalled=true;return 'unsafe';},groq:async()=>{throw Error('503')}} as unknown as Parameters<typeof runTutorFallbackChain>[1];
 await assert.rejects(runTutorFallbackChain(options,runners),/providers unavailable/);
 assert.equal(geminiCalled,false);
});
test('Groq uses its model fallback without another provider',async()=>{
 const seen:string[]=[];
 const result=await runTutorFallbackChain(options,{groq:async(model:string)=>{seen.push(model);if(seen.length===1)throw Error('model unavailable');return 'Groq fallback hint';}});
 assert.equal(result.provider,'groq');assert.equal(result.text,'Groq fallback hint');assert.equal(seen.length,2);
});
