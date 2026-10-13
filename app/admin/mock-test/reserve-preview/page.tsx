import {notFound} from 'next/navigation';
import Link from 'next/link';
import {sql} from 'drizzle-orm';
import {getDb} from '@/lib/db';
import {requireMockTestAdminPage} from '@/lib/admin/mockTestAdmin';
import ReservePreviewClient from './preview-client';
import {getReservePreviewLocation, getReservePreviewNavigation, reservePreviewHref} from '@/lib/mockTest/reservePreview';

export const dynamic='force-dynamic';
export const metadata={title:'Dec 5 Form A · Admin Runner Preview',robots:{index:false,follow:false}};

function parseNotes(value:unknown){try{return typeof value==='string'?JSON.parse(value):value as Record<string,unknown>;}catch{return {};}}

export default async function ReservePreviewPage({searchParams}:{searchParams:Promise<{section?:string;question?:string}>}){
 await requireMockTestAdminPage();
 const db=getDb();if(!db)notFound();
 const params=await searchParams;
 const {section,question:position,total:max}=getReservePreviewLocation(params);
 const navigation=getReservePreviewNavigation(section,position);
 if(!Number.isInteger(position)||position<1||position>max)notFound();
 // Read the locked Form A, never create a registration or session.
 const rows=await db.execute(sql`select fq.position,q.prompt,q.passage,q.choices,q.difficulty,q.review_notes,q.status,q.usage_scope
 from mock_test_form_questions fq
 join mock_test_forms f on f.id=fq.form_id
 join mock_tests t on t.id=f.mock_test_id
 join questions q on q.id=fq.question_id
 where t.slug='2026-12-05' and f.version='A' and f.status='locked' and fq.section_key=${section}
 order by fq.position`);
 if(rows.rows.length!==max)notFound();
 if(rows.rows.some(r=>r.status!=='published'||r.usage_scope!=='mock_reserve'))notFound();
 const item=rows.rows[position-1];if(!item)notFound();
 const notes=parseNotes(item.review_notes);
 const passageNumber=section==='english'?Math.ceil(position/10):section==='reading'?Math.ceil(position/9):section==='science'?String(notes?.passageNumber??''):'';
 const passageOrdinal=section==='english'?(position-1)%10+1:section==='reading'?(position-1)%9+1:position;
 return <main style={{minHeight:'100vh',background:'#080f1b',color:'#eef1f5'}}>
  <div style={{padding:'16px 24px',borderBottom:'1px solid #26354a',display:'flex',gap:14,alignItems:'center',flexWrap:'wrap'}}>
   <strong>ACED · Admin-only Form A dry-run</strong>
   <Link href={reservePreviewHref('reading',35)} style={{color:'#9ad9ff'}}>Reading IV · Q35</Link>
   <Link href={reservePreviewHref('english',1)} style={{color:'#9ad9ff'}}>English · Q1</Link>
   <Link href={reservePreviewHref('math',1)} style={{color:'#9ad9ff'}}>Math · Q1</Link>
   <Link href={reservePreviewHref('science',1)} style={{color:'#9ad9ff'}}>Science · Q1</Link>
   <span style={{color:'#aab5c5'}}>Preview only · no registration or answers saved</span>
  </div>
  <nav aria-label="Preview question navigation" style={{padding:'12px 24px',display:'flex',alignItems:'center',gap:18,flexWrap:'wrap'}}>
   {navigation.previous?<Link style={{color:'#9ad9ff'}} href={navigation.previous}>← Previous</Link>:null}
   <span>{section.toUpperCase()} · {position} of {max} · Passage {passageNumber}</span>
   {navigation.next?<Link style={{color:'#9ad9ff'}} href={navigation.next}>Next →</Link>:null}
  </nav>
  <ReservePreviewClient key={section+position} section={section} title={String(notes?.passageTitle??'')} prompt={String(item.prompt)} passage={item.passage?String(item.passage):''} choices={item.choices as Record<'A'|'B'|'C'|'D',string>} difficulty={String(item.difficulty)} number={position} ordinal={passageOrdinal} passageNumber={passageNumber} total={max}/>
 </main>;
}
