import { chromium } from 'playwright-core';
const browser=await chromium.launch({headless:true,channel:process.env.CHROME_PATH ? undefined : "chrome",...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
const result={};const base=process.env.ACED_CHECK_BASE||'https://aceditprep.com';
for(const route of ['/','/terms','/privacy','/refunds','/contact']){
 const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();const errors=[];const challenged=[];const failures=[];const protectedRequests=[];
 page.on('request',r=>{if(/\/(?:api\/auth\/(?:session|providers)|dashboard|practice|admin|mock-test)(?:[/?]|$)/.test(new URL(r.url()).pathname))protectedRequests.push({url:r.url(),type:r.resourceType()})});
 page.on('response',r=>{if(r.status()===401)errors.push({url:r.url(),type:r.request().resourceType(),status:401});});
 page.on('requestfailed',r=>failures.push({url:r.url(),failure:r.failure()}));
 page.on('dialog',d=>{challenged.push(d.type());void d.dismiss()});
 try{await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:20000});await page.waitForTimeout(4500);}catch(e){failures.push({navigation:String(e).slice(0,120)})}
 result[route]={errors,challenged,failures,protectedRequests};await context.close();
}
for(const route of ['/dashboard','/practice','/admin','/api/health','/mock-test']){const context=await browser.newContext();const page=await context.newPage();try{const r=await page.goto(base+route,{waitUntil:'commit',timeout:10000});result[route]={status:r?.status()}}catch(e){result[route]={error:String(e).slice(0,120)}}await context.close()}
console.log(JSON.stringify(result,null,2));await browser.close();
