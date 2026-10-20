import {spawnSync} from 'node:child_process';
import pg from 'pg';
import { factoryReviewAuditLines } from '../lib/content-factory-review.mjs';
import { FACTORY_BATCH_TIMEOUT_MS, describeFactoryProcessError, redactFactoryError } from '../lib/content-factory-process.mjs';
import { parseContentFactoryArgs } from '../lib/content-factory-args.mjs';
const arg=parseContentFactoryArgs(process.argv.slice(2));
const limit=Math.min(20,Math.max(1,Number(arg.limit||20)));
if(!Number.isInteger(limit))throw Error('Invalid limit');
const pacificHour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
if(!arg.manual && pacificHour!==1){console.log('Skipped: outside 1 AM Pacific hour');process.exit(0)}
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
await db.connect();
let runId;let result={inserted:0,rejected:0,skipped:0,quota_paused:0,status:'skipped',note:''};
try{
 const created=await db.query('insert into content_factory_runs(status,requested_limit) values ($1,$2) returning id',['running',limit]);runId=created.rows[0].id;
 const key=process.env.CONTENT_FACTORY_GEMINI_API_KEY;
 if(!key){result.note='Missing CONTENT_FACTORY_GEMINI_API_KEY; skipped';console.log(result.note)}
 else{
  // Explicitly remove all tutor and other provider credentials. No Groq fallback.
  const env={...process.env,GEMINI_GENERATION_MODEL:'gemini-3.1-flash-lite-preview',GEMINI_REVIEW_MODEL:'gemini-2.5-flash',CONTENT_FACTORY_REQUEST_SPACING_MS:'5000',GEMINI_API_KEY:key,GOOGLE_API_KEY:key,QUESTION_GENERATION_PROVIDER:'gemini',QUESTION_REVIEW_PROVIDER:'gemini',CONTENT_GENERATION_PROVIDER:'gemini',GROQ_API_KEY:'',OPENROUTER_API_KEY:'',OPENROUTER_GENERATION_MODEL:'',OPENROUTER_REVIEW_MODEL:'',OLLAMA_GENERATION_MODEL:'',OLLAMA_REVIEW_MODEL:'',OLLAMA_MODEL:'',OLLAMA_API_BASE_URL:'',OLLAMA_BASE_URL:''};
  const child=spawnSync('node',['scripts/content-generate-next.mjs','--scope=practice',`--limit=${limit}`,'--provider=gemini'],{cwd:process.cwd(),env,encoding:'utf8',timeout:FACTORY_BATCH_TIMEOUT_MS,maxBuffer:10*1024*1024});
  const output=child.stdout||'';
  const stderr=child.stderr||'';
  for(const line of factoryReviewAuditLines(output))console.log(line)
  const safeError=(value)=>redactFactoryError(value,key).slice(0,1400);
  const at=output.lastIndexOf('Generation batch summary:');
  let failureKind = null;
  if(at>=0){try{
    const parsed=JSON.parse(output.slice(output.indexOf('{',at)));
    for(const job of parsed.jobs||[]){
      result.inserted+=Number(job.inserted||0);
      result.rejected+=Number(job.reviewRejected||0);
      result.skipped+=Number(job.skipped||0);
      const failure=job.providerFailure;
      const detail=safeError(failure?.message||job.error||'');
      if(detail)result.note=`${failure?.provider||'gemini'} ${failure?.kind||job.pauseReason||'error'}: ${detail}`;
      const auth=/invalid api key|api key not valid|unauthorized|authentication|permission denied|http 401|http 403/i.test(detail);
      const quota=/quota|rate.limit|RESOURCE_EXHAUSTED|429/i.test(detail)||['hard-quota','temporary-rate-limit'].includes(failure?.kind);
      if(auth)failureKind='auth_error';
      else if(quota&&!failureKind){failureKind='quota_paused';result.quota_paused++;}
      else if((job.error||job.runState==='paused_due_to_provider')&&!failureKind)failureKind='failed';
    }
  }catch{result.note='Unable to parse generator summary'}}
  if(result.inserted>limit)throw Error('Inserted count exceeded cap');
  result.status=failureKind|| (child.status===0?'completed':'failed');
  if(child.error){result.status='failed';result.note=describeFactoryProcessError({...child.error,killed:child.error.code==='ETIMEDOUT',signal:child.signal,stderr,stdout:output},FACTORY_BATCH_TIMEOUT_MS,key)}
  if(!result.note&&child.status!==0)result.note=safeError(stderr||output.slice(-1400));
  if(!result.note&&child.status!==0)result.note='Generator exited unsuccessfully';
  if(['failed','auth_error'].includes(result.status))process.exitCode=1;
  console.log(JSON.stringify({generationModel:env.GEMINI_GENERATION_MODEL,reviewModel:env.GEMINI_REVIEW_MODEL,status:result.status,requested:limit,inserted:result.inserted,rejected:result.rejected,skipped:result.skipped,quota_paused:result.quota_paused,note:result.note}));
 }
} catch(e){result.status='failed';result.note=redactFactoryError(e.message,process.env.CONTENT_FACTORY_GEMINI_API_KEY);console.log('Factory failed:',result.note);process.exitCode=1}
finally{if(runId)await db.query('update content_factory_runs set finished_at=now(),status=$2,inserted=$3,rejected=$4,skipped=$5,quota_paused=$6,note=$7 where id=$1',[runId,result.status,result.inserted,result.rejected,result.skipped,result.quota_paused,result.note]);await db.end()}
