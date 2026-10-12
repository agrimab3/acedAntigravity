"use client";
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
 return <div className={styles.scroller}><div className={styles.passage}>
 {intro && <p className={styles.intro}>{intro}</p>}
 {lines.map((line,i)=>{
  if(line==='PASSAGE A'||line==='PASSAGE B')return <div key={i} className={styles.heading}>{line==='PASSAGE A'?'Passage A':'Passage B'}</div>;
  const match=line.match(/^(\d{3}) (¶ |  )(.*)$/);
  if(!match)return <div key={i} className={styles.line}>{line}</div>;
  const n=Number(match[1]),paragraph=match[2].includes('¶');
  return <div key={i} className={styles.line}><span className={styles.number}>{n%5===0?n:''}</span><span className={paragraph?styles.paragraph:styles.words}>{match[3]}</span></div>;
 })}
 </div></div>;
}
