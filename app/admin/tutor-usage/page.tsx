import Link from 'next/link';
import {redirect} from 'next/navigation';
import {sql} from 'drizzle-orm';
import {getAdminSession} from '@/lib/admin';
import {getDb} from '@/lib/db';
export const dynamic='force-dynamic';
export default async function TutorUsagePage(){
 const session=await getAdminSession();if(!session)redirect('/');
 const db=getDb();
 const rows=db?(await db.execute(sql`select provider,model,count(*)::int as requests from tutor_model_usage where created_at > now() - interval '30 days' group by provider,model order by requests desc`)).rows:[];
 return <main style={{background:'#0B0C1A',color:'#eee',minHeight:'100vh',padding:'2rem',fontFamily:'DM Sans, sans-serif'}}><Link href="/admin/mock-test">← admin</Link><h1>Tutor model usage</h1><p>Last 30 days · successful model responses only · no student information stored</p><table><thead><tr><th>Provider</th><th>Model</th><th>Responses</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td style={{padding:12}}>{String(r.provider)}</td><td style={{padding:12}}>{String(r.model)}</td><td style={{padding:12}}>{Number(r.requests)}</td></tr>)}</tbody></table></main>;
}
