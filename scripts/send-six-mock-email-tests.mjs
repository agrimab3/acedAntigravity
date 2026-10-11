// Explicit one-off opt-in send. Requires --send and production Resend credentials.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {Resend}=require('resend');
if(!process.argv.includes('--send'))throw Error('Use --send to authorize six test emails');
if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)throw Error('Missing Resend configuration');
const {renderEveryMockEmailForTest,MOCK_EMAIL_HEADER_TOKEN}=await import('../lib/mockTest/email-templates.ts');
const {getMockEmailHeaderFilename}=await import('../lib/mockTest/email-outbox.ts');
const base='https://aceditprep.com';
const rendered=renderEveryMockEmailForTest({timeZone:'America/Los_Angeles',baseUrl:base});
const resend=new Resend(process.env.RESEND_API_KEY);
for(const e of rendered){
 const filename=getMockEmailHeaderFilename(e.type);
 const header=`${base}/email/${filename}`;
 const html=e.html.replace(MOCK_EMAIL_HEADER_TOKEN,header);
 const links=[...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
 const checks={gif:fs.existsSync(`public/email/${filename}`)&&html.includes(header),links:links.every(u=>u.startsWith(base)||u.startsWith('mailto:')),support:html.includes('reply to this email')||html.includes('support@aceditprep.com')||e.text.includes('reply to this email')};
 if(Object.values(checks).some(v=>!v)){console.log(JSON.stringify({type:e.type,status:'not_sent',checks}));continue;}
 const response=await resend.emails.send({from:process.env.EMAIL_FROM,to:'support@aceditprep.com',replyTo:'support@aceditprep.com',subject:`[TEST] ${e.subject}`,html,text:e.text,attachments:e.attachments});
 console.log(JSON.stringify({type:e.type,status:response.error?'error':'accepted',message:response.error?.message||null,checks}));
}
