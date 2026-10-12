'use client';
import {Fragment} from 'react';
import styles from './SciencePassage.module.css';

function inline(text:string){return text.split(/(\*[^*]+\*)/g).map((part,i)=>part.startsWith('*')&&part.endsWith('*')?<em key={i}>{part.slice(1,-1)}</em>:<Fragment key={i}>{part}</Fragment>);}
export default function SciencePassage({text}:{text:string}){
 const lines=text.split('\n');const blocks:React.ReactNode[]=[];
 for(let i=0;i<lines.length;){
  const line=lines[i].trim();if(!line){i++;continue;}
  if(/^\|/.test(line)&&i+1<lines.length){
   const rows:string[][]=[];while(i<lines.length&&/^\|/.test(lines[i].trim())){rows.push(lines[i].trim().slice(1,-1).split('|').map(x=>x.trim()));i++;}
   if(rows.length<2||!rows[1].every(x=>/^:?-{3,}:?$/.test(x)))throw Error('Malformed Science markdown table');
   blocks.push(<div className={styles.tableScroll} key={'t'+i}><table className={styles.table}><thead><tr>{rows[0].map((cell,j)=><th key={j} scope="col">{inline(cell)}</th>)}</tr></thead><tbody>{rows.slice(2).map((row,j)=><tr key={j}>{row.map((cell,k)=><td key={k} className={/^[+−-]?\d+(?:\.\d+)?$/.test(cell)?styles.numeric:undefined}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>);continue;
  }
  const caption=line.match(/^\*\*(Table \d+(?::.*?)?)\*\*$/);
  if(caption){blocks.push(<div className={styles.caption} key={i}>{caption[1]}</div>);i++;continue;}
  const heading=line.match(/^\*\*(Experiment \d+|Study \d+|Student \d+)\*\*$/);
  if(heading){blocks.push(<h3 className={styles.heading} key={i}>{heading[1]}</h3>);i++;continue;}
  if(/^\*[^*]+\*$/.test(line)){blocks.push(<p className={styles.note} key={i}>{inline(line)}</p>);i++;continue;}
  if(line.startsWith('- ')){const list=[];const key=i;while(i<lines.length&&lines[i].trim().startsWith('- ')){list.push(lines[i].trim().slice(2));i++;}blocks.push(<ul key={key}>{list.map((v,j)=><li key={j}>{inline(v)}</li>)}</ul>);continue;}
  const paragraph=[];const key=i;while(i<lines.length&&lines[i].trim()&&!/^\|/.test(lines[i].trim())&&!/^\*\*(?:Table \d+|Experiment \d+|Study \d+|Student \d+)/.test(lines[i].trim())&&!lines[i].trim().startsWith('- ')){paragraph.push(lines[i].trim());i++;}
  if(!paragraph.length){i++;continue;}blocks.push(<p key={key}>{inline(paragraph.join(' '))}</p>);
 }
 return <div className={styles.root}>{blocks}</div>;
}
