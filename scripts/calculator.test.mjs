import test from 'node:test';
import assert from 'node:assert/strict';
const mathModule = await import('../components/calculator/math.ts');
const {calculate,compileCurve,specialPoints}=mathModule.default??mathModule;
const value=(expr,angle)=>calculate(expr,angle).decimal;
test('arithmetic precedence, fractions, negatives, exponent, percentage and ans',()=>{
 assert.equal(value('2+3*4'),14);
 assert.equal(calculate('2/3+1/4').exact,'11/12');
 assert.equal(value('-3^2'),-9);assert.equal(value('(-3)^2'),9);
 assert.equal(value('sqrt(81)'),9);assert.equal(value('2^8'),256);assert.equal(value('25%'),.25);
 assert.equal(calculate('ans+2','deg',7).decimal,9);
});
test('trig degrees/radians and logarithms',()=>{
 assert.ok(Math.abs(value('sin(30)','deg')-.5)<1e-10);
 assert.ok(Math.abs(value('sin(pi/6)','rad')-.5)<1e-10);
 assert.equal(value('log(100)'),2);assert.equal(value('ln(e)'),1);
});
test('implicit multiplication and extreme values',()=>{
 assert.equal(compileCurve('y=2x+3').fn(2,7),0);
 assert.equal(compileCurve('y=3(x+1)').fn(2,9),0);
 assert.equal(compileCurve('y=(x+1)(x-2)').fn(3,4),0);
 assert.equal(value('10^12'),1e12);assert.equal(value('10^-9'),1e-9);
});
test('friendly errors and hostile input rejected',()=>{
 assert.throws(()=>calculate('1/0'),/divide by zero/);
 assert.throws(()=>calculate('2+'),/missing|bracket/);
 for(const input of ['import("x")','createUnit("x")','constructor','x.constructor','evaluate("2")','[1,2]','1;2'])assert.throws(()=>calculate(input));
});
const bounds={xmin:-6,xmax:6,ymin:-6,ymax:10};
const intersections=(a,b)=>specialPoints([compileCurve(a),compileCurve(b)],bounds).filter(p=>p.kind==='intersection');
test('parabola and line intersect twice',()=>{const pts=intersections('y=x^2','y=x+2');assert.equal(pts.length,2);for(const [x,y] of [[-1,1],[2,4]])assert.ok(pts.some(p=>Math.hypot(p.x-x,p.y-y)<.02));});
test('parabola zeros',()=>{const pts=specialPoints([compileCurve('y=x^2-4')],bounds).filter(p=>p.kind==='x-intercept');assert.ok(pts.some(p=>Math.abs(p.x-2)<.01));assert.ok(pts.some(p=>Math.abs(p.x+2)<.01));});
test('vertical line intersects parabola',()=>{const pts=intersections('x=3','y=x^2');assert.ok(pts.some(p=>Math.hypot(p.x-3,p.y-9)<.03));});
test('circle intersects horizontal line',()=>{const pts=intersections('(x-2)^2+(y+1)^2=9','y=-1');assert.ok(pts.some(p=>Math.hypot(p.x+1,p.y+1)<.03));assert.ok(pts.some(p=>Math.hypot(p.x-5,p.y+1)<.03));});

test('ordinary ACT graph notation, pi and decimals',()=>{
 const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
 near(compileCurve('y=3πx').fn(2,6*Math.PI),0);
 near(compileCurve('y=2πx').fn(3,6*Math.PI),0);
 near(compileCurve('y=πx²').fn(2,4*Math.PI),0);
 near(compileCurve('y=0.5x+1.25').fn(2,2.25),0);
 near(compileCurve('y=3(x+1)').fn(2,9),0);
 near(value('2π'),2*Math.PI);
 near(value('0.5+1.25'),1.75);
 assert.throws(()=>calculate('x.constructor'),/unsupported|numbers/);
});
