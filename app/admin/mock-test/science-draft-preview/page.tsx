import {notFound} from 'next/navigation';
import Link from 'next/link';
import {sql} from 'drizzle-orm';
import {getDb} from '@/lib/db';
import {requireMockTestAdminPage} from '@/lib/admin/mockTestAdmin';
import ReservePreviewClient from '../reserve-preview/preview-client';

export const dynamic='force-dynamic';
export const metadata={title:'Science Drafts · Admin Preview',robots:{index:false,follow:false}};
export default async function ScienceDraftPreview({searchParams}:{searchParams:Promise<{question?:string}>}){
 await requireMockTestAdminPage();const db=getDb();if(!db)notFound();
 const {question}=await searchParams;const position=Number(question??1);
 if(!Number.isInteger(position)||position<1||position>40)notFound();
 const rows=await db.execute(sql`select q.prompt,q.passage,q.choices,q.difficulty,q.review_notes from questions q where q.section_key='science' and q.status='draft' and q.usage_scope='mock_reserve' and q.source like 'science-final:%' order by (q.review_notes::jsonb->>'questionNumber')::int`);
 if(rows.rows.length!==40)notFound();
 const item=rows.rows[position-1];const notes=typeof item.review_notes==='string'?JSON.parse(item.review_notes):item.review_notes as Record<string,string>;
 const passageNumber=position<=12?Math.ceil(position/6):Math.ceil((position-12)/7)+2;
 return <main style={{minHeight:'100vh',background:'#080f1b',color:'#eef1f5'}}><nav style={{padding:'18px 24px',display:'flex',gap:24}}><strong>Science drafts · admin preview · Form A unchanged</strong>{position>1?<Link href={`?question=${position-1}`}>← Previous</Link>:null}<span>{position} / 40</span>{position<40?<Link href={`?question=${position+1}`}>Next →</Link>:null}</nav><ReservePreviewClient key={position} section="science" title={notes.passageTitle??''} prompt={String(item.prompt)} passage={String(item.passage)} choices={item.choices as Record<'A'|'B'|'C'|'D',string>} difficulty={String(item.difficulty)} number={position} ordinal={position} passageNumber={passageNumber} total={40}/></main>;
}
