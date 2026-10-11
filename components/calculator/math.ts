import { create, all, type MathNode } from 'mathjs';

const math = create(all, { number: 'Fraction', predictable: true });
const graphMath = create(all, { number: 'number', predictable: true });
const forbidden = /\b(?:import|createUnit|evaluate|parse|simplify|derivative|resolve|typed|chain|map|filter|forEach|constructor|prototype|__proto__|matrix|ones|zeros|random|pickRandom|help|unit|index|subset|range|concat|resize|size|config)\b|[;{}\[\]"'`]|\./i;
const allowedFunctions = new Set(['sin','cos','tan','asin','acos','atan','sqrt','abs','log','ln','exp','floor','ceil','round']);
const allowedSymbols = new Set(['x','y','pi','e','ans']);
export type AngleMode = 'deg' | 'rad';
export function friendlyError(error: unknown): string {
  const s = error instanceof Error ? error.message : String(error);
  if (/zero|Infinity|divide/i.test(s)) return 'cannot divide by zero';
  if (/parenthesis|bracket|\)/i.test(s)) return 'a bracket isn’t closed';
  if (/end of expression|unexpected end|value expected|operator expected/i.test(s)) return 'something is missing after an operator';
  if (/symbol|undefined|function|variable/i.test(s)) return 'use x and y only, or supported functions';
  return 'check the equation and try again';
}
function checked(expression: string, graph: boolean): MathNode {
  if (expression.length > 180 || forbidden.test(expression)) throw new Error('unsupported input');
  const normalized = expression.replace(/[−–]/g, '-').replace(/×/g, '*').replace(/÷/g, '/').replace(/π/g, 'pi').replace(/√\s*\(/g, 'sqrt(').replace(/√\s*([\w.]+)/g, 'sqrt($1)').replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
  let node: MathNode;
  try { node = (graph ? graphMath : math).parse(normalized); } catch (e) { throw new Error(friendlyError(e)); }
  node.traverse((n) => {
    if (n.type === 'AssignmentNode' || n.type === 'FunctionAssignmentNode' || n.type === 'AccessorNode' || n.type === 'IndexNode' || n.type === 'BlockNode' || n.type === 'ArrayNode' || n.type === 'ObjectNode' || n.type === 'RangeNode' || n.type === 'ConditionalNode') throw new Error('unsupported input');
    if (n.type === 'FunctionNode') {
      const fn = (n as unknown as {fn:{name?:string}}).fn.name;
      if (!fn || !allowedFunctions.has(fn)) throw new Error('unsupported function');
    }
    if (n.type === 'SymbolNode') {
      const name = (n as unknown as {name:string}).name;
      if (!allowedSymbols.has(name) && !allowedFunctions.has(name)) throw new Error('use x and y only');
      if (!graph && (name === 'x' || name === 'y')) throw new Error('use numbers in scientific mode');
    }
  });
  return node;
}
function asNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'object' && v !== null && 'valueOf' in v ? Number(v.valueOf()) : Number(String(v));
  if (!Number.isFinite(n)) throw new Error('cannot divide by zero');
  return n;
}
function scope(angle: AngleMode, ans: number, x = 0, y = 0) {
  const trig = (fn: 'sin'|'cos'|'tan', a: unknown) => Math[fn](asNumber(a) * (angle === 'deg' ? Math.PI/180 : 1));
  return { x, y, ans, pi: Math.PI, e: Math.E, sin:(a:unknown)=>trig('sin',a), cos:(a:unknown)=>trig('cos',a), tan:(a:unknown)=>trig('tan',a), asin:(a:unknown)=>Math.asin(asNumber(a))*(angle==='deg'?180/Math.PI:1), acos:(a:unknown)=>Math.acos(asNumber(a))*(angle==='deg'?180/Math.PI:1), atan:(a:unknown)=>Math.atan(asNumber(a))*(angle==='deg'?180/Math.PI:1), sqrt:(a:unknown)=>Math.sqrt(asNumber(a)), log:(a:unknown)=>Math.log10(asNumber(a)), ln:(a:unknown)=>Math.log(asNumber(a)), abs:Math.abs, exp:Math.exp, floor:Math.floor, ceil:Math.ceil, round:Math.round };
}
export function calculate(expression: string, angle: AngleMode = 'deg', ans = 0): {exact:string; decimal:number} {
  if (/\b[xy]\b/.test(expression)) throw new Error('use numbers in scientific mode');
  const node = checked(expression, /\bpi\b|π|\be\b/.test(expression));
  try {
    const v = node.compile().evaluate(scope(angle, ans));
    const decimal = asNumber(v);
    return {exact: typeof v === 'object' && v !== null && 'toFraction' in v ? (v as {toFraction:()=>string}).toFraction() : String(Number(decimal.toPrecision(12))), decimal};
  } catch (e) { throw new Error(friendlyError(e)); }
}
export type Curve = {expression:string; fn:(x:number,y:number)=>number; kind:'function'|'vertical'|'implicit'};
export function compileCurve(expression:string):Curve {
  const eq = expression.trim().replace(/−/g,'-');
  const match = eq.match(/^(.*?)=(.*)$/);
  const lhs = match ? match[1].trim() : 'y';
  const rhs = match ? match[2].trim() : eq;
  if (!rhs) throw new Error('something is missing after =');
  const kind = lhs === 'y' ? 'function' : lhs === 'x' ? 'vertical' : 'implicit';
  const left = checked(lhs, true).compile();
  const right = checked(rhs, true).compile();
  return {expression,kind,fn:(x,y)=>{
    try {const s=scope('rad',0,x,y);return asNumber(left.evaluate(s))-asNumber(right.evaluate(s));} catch {return NaN;}
  }};
}
export type Point = {x:number;y:number;kind:'intersection'|'x-intercept'|'y-intercept'};
function crossings(a:number,b:number){return Number.isFinite(a)&&Number.isFinite(b)&&(a===0||b===0||a*b<0);}
function refine(fn:(x:number,y:number)=>number,x1:number,y1:number,x2:number,y2:number){let a=0,b=1,va=fn(x1,y1);for(let i=0;i<23;i++){const m=(a+b)/2;const v=fn(x1+(x2-x1)*m,y1+(y2-y1)*m);if(!Number.isFinite(v))break;if(va*v<=0)b=m;else{a=m;va=v;}}const t=(a+b)/2;return {x:x1+(x2-x1)*t,y:y1+(y2-y1)*t};}
export function traceCurve(curve:Curve,bounds:{xmin:number;xmax:number;ymin:number;ymax:number},resolution=85):{x:number;y:number}[][]{
 const {xmin,xmax,ymin,ymax}=bounds; const dx=(xmax-xmin)/resolution,dy=(ymax-ymin)/resolution;const segments:{x:number;y:number}[][]=[];
 for(let i=0;i<resolution;i++)for(let j=0;j<resolution;j++){
  const x=xmin+i*dx,y=ymin+j*dy;
  const corners=[[x,y],[x+dx,y],[x+dx,y+dy],[x,y+dy]];
  const values=corners.map(([xx,yy])=>curve.fn(xx,yy));const pts:{x:number;y:number}[]=[];
  for(let k=0;k<4;k++){const next=(k+1)%4;if(crossings(values[k],values[next]))pts.push(refine(curve.fn,corners[k][0],corners[k][1],corners[next][0],corners[next][1]));}
  if(pts.length===2)segments.push(pts);else if(pts.length===4){segments.push([pts[0],pts[1]],[pts[2],pts[3]]);}
 }
 return segments;
}
function near(a:Point,b:Point,tol:number){return Math.hypot(a.x-b.x,a.y-b.y)<tol;}
export function specialPoints(curves:Curve[],bounds:{xmin:number;xmax:number;ymin:number;ymax:number}):Point[]{
 const result:Point[]=[];const span=Math.max(bounds.xmax-bounds.xmin,bounds.ymax-bounds.ymin);const tol=span/150;
 const add=(p:Point)=>{if(Number.isFinite(p.x)&&Number.isFinite(p.y)&&!result.some(q=>near(p,q,tol)))result.push(p);};
 const roots=(f:(t:number)=>number,min:number,max:number)=>{const out:number[]=[];const n=360;let prev=f(min);for(let i=1;i<=n;i++){const a=min+(max-min)*(i-1)/n,b=min+(max-min)*i/n,v=f(b);if(crossings(prev,v)){if(Math.abs(prev)<1e-9)out.push(a);else if(Math.abs(v)<1e-9)out.push(b);else{let l=a,r=b,fl=prev;for(let k=0;k<28;k++){const m=(l+r)/2,fm=f(m);if(fl*fm<=0)r=m;else{l=m;fl=fm;}}out.push((l+r)/2);}}prev=v;}return out;};
 for(const c of curves){for(const x of roots(t=>c.fn(t,0),bounds.xmin,bounds.xmax))add({x,y:0,kind:'x-intercept'});for(const y of roots(t=>c.fn(0,t),bounds.ymin,bounds.ymax))add({x:0,y,kind:'y-intercept'});}
 // Pairwise intersections: bracket roots along contours of the first curve.
 for(let i=0;i<curves.length;i++)for(let j=i+1;j<curves.length;j++){
  const a=curves[i],b=curves[j];
  const lines=traceCurve(a,bounds,62);
  for(const [p,q] of lines){const v=b.fn(p.x,p.y),w=b.fn(q.x,q.y);if(!crossings(v,w))continue;let lo=0,hi=1,vl=v;for(let k=0;k<25;k++){const t=(lo+hi)/2;const vt=b.fn(p.x+(q.x-p.x)*t,p.y+(q.y-p.y)*t);if(vl*vt<=0)hi=t;else{lo=t;vl=vt;}}const t=(lo+hi)/2;add({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t,kind:'intersection'});}
 }
 return result.slice(0,60);
}
export function pretty(n:number){const i=Math.round(n);if(Math.abs(n-i)<0.0003)return String(i);for(let d=2;d<=12;d++){const num=Math.round(n*d);if(Math.abs(n-num/d)<0.0003)return `${num}/${d}`;}return Number(n.toFixed(3)).toString();}
