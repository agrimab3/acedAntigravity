import { notFound } from 'next/navigation';
import {createHash} from 'node:crypto';
import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { requireMockTestAdminPage } from '@/lib/admin/mockTestAdmin';
import ReservePreviewClient from './preview-client';

export const dynamic='force-dynamic';
export const metadata={title:'Reserve Runner Preview · ACED',robots:{index:false,follow:false}};

export default async function ReservePreviewPage({searchParams}:{searchParams:Promise<{section?:string}>}){
 await requireMockTestAdminPage();
 const db=getDb();if(!db)notFound();
 const params=await searchParams;
 const section=params.section==='english'?'english':'reading';
 const title=section==='reading'?'NATURAL SCIENCE: Birdsong in the City (paired passages)':'The Night Garden';
 const key=section==='reading'?'mock-reading-final-v1:':'mock-longpassage-v1:';
 const fingerprint=createHash('sha256').update(key+title+':'+(section==='reading'?8:1)).digest('hex');
 const rows=await db.execute(sql`select q.id,q.prompt,q.passage,q.choices,q.difficulty,q.review_notes from questions q
 where q.section_key=${section} and q.status='draft' and q.usage_scope='mock_reserve'
 and q.fingerprint=${fingerprint}
 and not exists(select 1 from mock_test_form_questions f where f.question_id=q.id) limit 1`);
 const item=rows.rows[0];
 if(!item)notFound();
 const notes=typeof item.review_notes==='string'?JSON.parse(item.review_notes):item.review_notes;
 return <main style={{minHeight:'100vh',background:'#080f1b',color:'#eef1f5'}}>
  <div style={{padding:'16px 24px',borderBottom:'1px solid #26354a',display:'flex',gap:20,alignItems:'center',flexWrap:'wrap'}}>
   <strong>ACED · Admin-only reserve runner preview</strong>
   <Link href="?section=reading" style={{color:'#9ad9ff'}}>Reading IV · Q8</Link>
   <Link href="?section=english" style={{color:'#9ad9ff'}}>English · underlined Q1</Link>
   <span style={{color:'#aab5c5'}}>No registration, timer, submissions, or Form A changes</span>
  </div>
  <ReservePreviewClient key={section} section={section} title={String(notes?.passageTitle??'')} prompt={String(item.prompt)} passage={String(item.passage)} choices={item.choices as Record<'A'|'B'|'C'|'D',string>} difficulty={String(item.difficulty)} number={section==='reading'?8:1}/>
 </main>;
}
