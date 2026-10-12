"use client";
import {useEffect,useRef,useState} from 'react';
import styles from './ReadingPassage.module.css';

const intros: Record<string,string> = {
  'My uncle Teo did not believe in instructions. When I arrived': 'This passage is an original story written for ACED.',
  'Walk across almost any college campus or city park and you are': 'This passage is an original essay written for ACED.',
  'When I began restoring old films, I believed my job was to': 'This passage is an original essay written for ACED. The narrator is a film restorer.',
  'In a quiet forest, a songbird\'s call can travel a long way. In': 'Passage A and Passage B are original essays written for ACED about why many city birds sing at higher pitches.',
};

export default function ReadingPassage({text}:{text:string}){
 const lines=text.split('\n');
 const intro=Object.entries(intros).find(([opening])=>text.includes(opening))?.[1];
 const root=useRef<HTMLDivElement>(null);
 const [fit,setFit]=useState({size:15,scale:1});
 useEffect(()=>{
  const element=root.current;if(!element)return;
  const measure=()=>{
   if(!window.matchMedia('(max-width: 639px)').matches){setFit({size:15,scale:1});return;}
   const available=Math.max(1,element.clientWidth-8);
   const canvas=document.createElement('canvas');
   const ctx=canvas.getContext('2d');if(!ctx)return;
   ctx.font='15px Georgia';
   const longest=Math.max(...lines.map(line=>{
    const match=line.match(/^\d{3} (?:¶ |  )(.*)$/);
    return match?ctx.measureText(match[1]).width+(match[0].includes('¶')?50:31):0;
   }),1);
   const size=Math.max(12,Math.min(15,15*available/longest));
   const width=longest*size/15;
   setFit({size,scale:Math.min(1,available/width)});
  };
  const observer=new ResizeObserver(measure);observer.observe(element);measure();
  window.addEventListener('resize',measure);
  return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
 },[text,lines.length]);
 return <div className={styles.scroller} ref={root}><div className={styles.passage} style={{fontSize:fit.size}}>
 {intro && <p className={styles.intro}>{intro}</p>}
 <div className={styles.lines} style={{transform:fit.scale<1?`scaleX(${fit.scale})`:undefined,width:fit.scale<1?`${100/fit.scale}%`:undefined}}>
 {lines.map((line,i)=>{
  if(line==='PASSAGE A'||line==='PASSAGE B')return <div key={i} className={styles.heading}>{line==='PASSAGE A'?'Passage A':'Passage B'}</div>;
  const match=line.match(/^(\d{3}) (¶ |  )(.*)$/);
  if(!match)return <div key={i} className={styles.line}>{line}</div>;
  const n=Number(match[1]),paragraph=match[2].includes('¶');
  return <div key={i} className={styles.line}><span className={styles.number}>{n%5===0?n:''}</span><span className={paragraph?styles.paragraph:styles.words}>{match[3]}</span></div>;
 })}
 </div></div></div>;
}
