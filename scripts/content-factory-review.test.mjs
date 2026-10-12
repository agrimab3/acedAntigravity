import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryReviewRunner, FACTORY_REVIEW_MODELS, factoryReviewAuditLines } from '../lib/content-factory-review.mjs';
import { ProviderRequestError, ProviderRunStoppedError, createProviderRunState } from '../lib/content-generation-resilience.mjs';
const quota = () => new ProviderRequestError('quota', { statusCode: 429, classification: { kind: 'hard-quota' } });

test('429 walks the exact four-model chain and returns actual reviewer model', async () => {
  const attempted = [];
  const result = await createFactoryReviewRunner()({
    operation: 'review:test', runState: createProviderRunState(),
    perform: async ({provider,model}) => {
      assert.equal(provider,'gemini'); attempted.push(model);
      if(model!==FACTORY_REVIEW_MODELS[3]) throw quota();
      return { reviewerResult: { verdict:'keep' } };
    },
  });
  assert.deepEqual(attempted,FACTORY_REVIEW_MODELS);
  assert.equal(result.model,FACTORY_REVIEW_MODELS[3]);
  assert.equal(result.reviewerResult.verdict,'keep');
});

test('model quotas are shared across primary/verifier calls without disabling generation', async () => {
  const run = createFactoryReviewRunner();
  const state = createProviderRunState();
  const calls = [];
  const perform = async ({model}) => {
    calls.push(model);
    if(model===FACTORY_REVIEW_MODELS[0]) throw quota();
    return { verifierResult:{ correctness_verified:'yes' } };
  };
  await run({operation:'review:one',runState:state,perform});
  await run({operation:'verify:one',runState:state,perform});
  await run({operation:'review:two',runState:state,perform});
  assert.deepEqual(calls,[FACTORY_REVIEW_MODELS[0],...Array(3).fill(FACTORY_REVIEW_MODELS[1])]);
  assert.ok(state.events.some(x=>x.model===FACTORY_REVIEW_MODELS[1]&&x.state==='success'));
  assert.ok(!state.providers?.gemini?.disabled);
});

test('temporary 429 also advances immediately without retries or waits', async () => {
  const calls=[];
  await createFactoryReviewRunner()({operation:'review:test',perform:async({model})=>{
    calls.push(model);
    if(calls.length===1)throw new ProviderRequestError('rate limit',{statusCode:429,classification:{kind:'temporary-rate-limit'}});
    return {};
  }});
  assert.deepEqual(calls,FACTORY_REVIEW_MODELS.slice(0,2));
});

test('all model quotas stop safely and do not approve a draft', async () => {
  let calls=0;
  await assert.rejects(createFactoryReviewRunner()({operation:'verify:test',perform:async()=>{
    calls++;throw quota();
  }}),ProviderRunStoppedError);
  assert.equal(calls,4);
});

test('auth, schema and transport errors do not become quota fallbacks', async () => {
  for(const error of [new ProviderRequestError('auth',{statusCode:403}),new Error('invalid schema'),new Error('transport')]){
    let calls=0;
    await assert.rejects(createFactoryReviewRunner()({operation:'review:test',perform:async()=>{calls++;throw error;}}),e=>e===error);
    assert.equal(calls,1);
  }
});

test('forwarded draft audit logs contain only IDs, stages and models', () => {
  const line='Factory review audit: candidate=1234-abcd stage=primary model=gemini-3-flash-preview';
  assert.deepEqual(factoryReviewAuditLines([line, 'secret provider response', line+' key=secret'].join('\n')), [line]);
});
