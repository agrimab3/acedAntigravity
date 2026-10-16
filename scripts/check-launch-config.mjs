#!/usr/bin/env node
// Read-only: reports names and presence/prefix only; never reveals values.
import fs from 'node:fs';
const path=process.argv.find(a=>a.startsWith('--env='))?.slice(6);
const config={...process.env};
if(path){for(const line of fs.readFileSync(path,'utf8').split(/\r?\n/)){if(!line.trim()||line.trim().startsWith('#'))continue;const i=line.indexOf('=');if(i<0)continue;let v=line.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);config[line.slice(0,i).trim()]=v;}}
const isProductionOrigin=v=>v==='https://aceditprep.com';
const isAcedMailbox=v=>/^(?:[^<>]+\s+)?<[^<>\s]+@aceditprep\.com>$|^[^<>\s]+@aceditprep\.com$/.test(v);
const checks=[
 ['Google provider ID','AUTH_GOOGLE_ID'],['Google provider secret','AUTH_GOOGLE_SECRET'],['NextAuth secret','AUTH_SECRET'],
 ['NextAuth production URL','NEXTAUTH_URL',isProductionOrigin],['Public production URL','NEXT_PUBLIC_SITE_URL',isProductionOrigin],
 ['Stripe TEST secret','STRIPE_SECRET_KEY',v=>v.startsWith('sk_test_')],
 ['Stripe TEST public key','NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',v=>v.startsWith('pk_test_')],
 ['Stripe TEST alternate public key','STRIPE_PUBLISHABLE_KEY',v=>v.startsWith('pk_test_')],
 ['Stripe webhook signature secret','STRIPE_WEBHOOK_SECRET',v=>v.startsWith('whsec_')],
 ['Resend','RESEND_API_KEY'],['Email sender','EMAIL_FROM',isAcedMailbox],['Email support','EMAIL_SUPPORT',isAcedMailbox],['Cron authentication','CRON_SECRET'],
 ['Admin emails','ADMIN_EMAILS'],['Sentry server','SENTRY_DSN'],['Sentry client','NEXT_PUBLIC_SENTRY_DSN'],
 ['Content factory key','CONTENT_FACTORY_GEMINI_API_KEY'],
 ['Google auth mode','MOCK_TEST_AUTH_MODE',v=>v==='google'],
 ['Stripe payment mode','MOCK_TEST_PAYMENT_MODE',v=>v==='stripe'],
];
let passed=0;
for(const [description,name,test] of checks){const v=config[name]||'';const ok=Boolean(v)&&(test?test(v):true);if(ok)passed++;console.log(`${ok?'✅':'❌'} ${name} — ${description}`)}
console.log(`${passed}/${checks.length} checks passed`);
if(passed!==checks.length)process.exitCode=1;
