'use client';
import {useRef,useState} from 'react';
import AcedCalculator from '@/components/calculator/AcedCalculator';
export default function CalculatorPreview(){const [open,setOpen]=useState(true);const [section,setSection]=useState<'Math'|'English'>('Math');const button=useRef<HTMLButtonElement>(null);return <main style={{minHeight:'100dvh',background:'#0B0C1A',color:'white',padding:30}}><h1>Calculator QA — {section}</h1><button onClick={()=>setSection(v=>v==='Math'?'English':'Math')}>Switch section</button><button ref={button} onClick={()=>setOpen(v=>!v)}>calculator</button>{section==='Math'&&<AcedCalculator id="qa-calculator" isOpen={open} onClose={()=>setOpen(false)} storageKey="aced-calculator:qa:math" returnFocusRef={button}/>}</main>}
