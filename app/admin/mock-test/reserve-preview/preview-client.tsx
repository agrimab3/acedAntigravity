'use client';
import {useState} from 'react';
import ReadingPassage from '@/components/question-content/ReadingPassage';
import QuestionContent from '@/components/question-content/QuestionContent';
import styles from '@/app/mock-test/run/run.module.css';

type Letter='A'|'B'|'C'|'D';
export default function ReservePreviewClient({section,title,prompt,passage,choices,difficulty,number,ordinal,passageNumber,total}:{section:string;title:string;prompt:string;passage:string;choices:Record<Letter,string>;difficulty:string;number:number;ordinal:number;passageNumber:number;total:number}){
 const [selected,setSelected]=useState<Letter|null>(null);
 return <div className={styles.contentFrame}>
 <div className={styles.mainArea+' '+styles.longPassageLayout}>
 <article className={styles.passageCard}>
 <div className={styles.passageLabel}>PASSAGE {passageNumber} · {title}</div>
 <div className={styles.passageText}>{section==='reading'?<ReadingPassage text={passage}/>:<QuestionContent text={passage} questionNumber={ordinal} underlineOrdinal={ordinal} activeUnderline/>}</div>
 </article>
 <section className={styles.questionColumn}>
 <div className={styles.questionHeader}><h1>question <span>{number}</span> <small>of {total}</small></h1></div>
 <div className={styles.questionMeta}>{section} · {difficulty} · admin preview</div>
 <div className={styles.questionText}><QuestionContent text={prompt} questionNumber={number} activeUnderline={section==='english'}/></div>
 <fieldset className={styles.choiceFieldset}><legend className={styles.srOnly}>Select an answer</legend>
 {(['A','B','C','D'] as Letter[]).map(letter=><label key={letter} className={styles.choiceRow} style={{borderColor:selected===letter?'#7bd7fa':undefined,background:selected===letter?'#1c334b':undefined}}>
 <input type="radio" name="preview-answer" checked={selected===letter} onChange={()=>setSelected(letter)}/>
 <strong style={{padding:'0 12px'}}>{letter}</strong><span className={styles.choiceText}>{choices[letter]}</span>
 </label>)}
 </fieldset>
 <p style={{color:'#91a1b7',fontSize:12,marginTop:16}}>Preview only — answer selection stays in this browser and is never saved.</p>
 </section>
 </div></div>;
}
