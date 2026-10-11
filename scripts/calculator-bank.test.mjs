import test from 'node:test';
import assert from 'node:assert/strict';
const m=await import('../components/calculator/math.ts');
const {calculate,compileCurve,specialPoints}=m.default??m;
const calc=e=>calculate(e).decimal;
// Numerical calculations corresponding to ten published Math questions read from ACED's bank.
const cases=[
 ['complex-number addition, real and imaginary parts',()=>[calc('4-2'),calc('-3+7')],[2,4]],
 ['same-color token probability',()=>calculate('(5*4+3*2)/(8*7)').exact,'13/28'],
 ['excluded rational-function domain value',()=>calc('4^2-4*4'),0],
 ['right-triangle cosine',()=>calculate('9/sqrt(9^2+12^2)').exact,'3/5'],
 ['continuous piecewise function',()=>calc('3*2-1-2^2'),1],
 ['round-trip average speed',()=>calc('240/(120/60+120/40)'),48],
 ['perpendicular line x intercept',()=>calc('5+12*2'),29],
 ['solar-panel threshold duration',()=>calc('8-4'),4],
 ['fixed plus hourly service charge at 2 hours',()=>calc('30*2+45'),105],
 ['regular polygon sides',()=>calc('360/(180-144)'),10],
];
for(const [label,compute,expected] of cases)test('ACED published math bank: '+label,()=>assert.deepEqual(compute(),expected));
test('solar panel intersection verifies threshold times',()=>{
 const points=specialPoints([compileCurve('y=12sin(pi*x/12)'),compileCurve('y=6sqrt(3)')],{xmin:0,xmax:12,ymin:0,ymax:13}).filter(p=>p.kind==='intersection');
 assert.ok(points.some(p=>Math.abs(p.x-4)<.03));assert.ok(points.some(p=>Math.abs(p.x-8)<.03));
});
