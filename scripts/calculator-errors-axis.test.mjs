import test from 'node:test';
import assert from 'node:assert/strict';
const m = await import('../components/calculator/math.ts');
const {compileCurve, axisTickStep, friendlyError} = m.default ?? m;
for(const [input,expected] of [
 ['y = 3x +','something is missing after +'],
 ['y = x −','something is missing after −'],
 ['y = x *','something is missing after ×'],
 ['y = x /','something is missing after ÷'],
 ['y = x ^','something is missing after ^'],
 ['y = (x + 1','a bracket isn’t closed'],
 ['y = x + 1)','there’s an extra )'],
 ['y = zebra','use x and y only'],
 ['y = z','use x and y only'],
 ['y =','add something after ='],
]) test('calculator error '+input,()=>assert.throws(()=>compileCurve(input),e=>friendlyError(e)===expected));
for(const span of [4,20,80,200,1000]) test('axis labels fit span '+span,()=>{
 const step=axisTickStep(span,400);
 const labelWidth=15+(Math.max(1,Math.floor(Math.log10(Math.max(1,span))))+3)*7;
 assert.ok(step*400/span>=labelWidth,`spacing ${step*400/span} must exceed ${labelWidth}`);
 assert.ok([1,2,5].includes(Number((step/10**Math.floor(Math.log10(step))).toPrecision(5))));
});
