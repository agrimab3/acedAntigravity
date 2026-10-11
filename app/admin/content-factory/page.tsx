import Link from 'next/link';
import {redirect} from 'next/navigation';
import {sql} from 'drizzle-orm';
import {getAdminSession} from '@/lib/admin';
import {getDb} from '@/lib/db';
export const dynamic='force-dynamic';
export default async function ContentFactoryAdmin(){
 if(!await getAdminSession())redirect('/');
 const db=getDb();const rows=db?(await db.execute(sql`select started_at,status,requested_limit,inserted,rejected,skipped,quota_paused,note from content_factory_runs order by started_at desc limit 7`)).rows:[];
 return <main style={{background:'#0b1522',color:'#eee',minHeight:'100vh',padding:32}}><Link href="/admin/mock-test">← Admin</Link><h1>Nightly content factory</h1><p>Last 7 runs · 1:30 AM Pacific · practice drafts only · maximum 20 per night</p><div style={{overflowX:'auto'}}><table><thead><tr>{['Started','Status','Cap','Inserted','Rejected','Skipped','Quota paused','Note'].map(x=><th key={x} style={{padding:12}}>{x}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{[new Date(String(r.started_at)).toLocaleString(),r.status,r.requested_limit,r.inserted,r.rejected,r.skipped,r.quota_paused,r.note??''].map((x,j)=><td key={j} style={{padding:12}}>{String(x)}</td>)}</tr>)}</tbody></table></div></main>
}
