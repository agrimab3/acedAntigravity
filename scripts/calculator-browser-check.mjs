import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport});
  await page.goto('http://localhost:3322/dev/calculator');
  await page.getByRole('tab',{name:'graph'}).click();
  await page.getByRole('textbox',{name:'Equation 1'}).fill('y=3πx');
  await page.getByRole('textbox',{name:'Equation 1'}).blur();
  assert.equal(await page.getByText('check the equation and try again').count(),0);
  await page.getByRole('textbox',{name:'Equation 1'}).fill('y=x^2');
  await page.getByRole('button',{name:/intersection \(2, 4\)/}).first().click();
  await page.getByText('intersection (2, 4)').waitFor();
  await page.getByRole('tab',{name:'scientific'}).click();
  await page.getByRole('textbox',{name:'Scientific expression'}).fill('3/4+2/3');
  await page.getByText('17/12').waitFor();
  await page.reload();
  await page.getByRole('tab',{name:'scientific'}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:'Scientific expression'}).inputValue(),'3/4+2/3');
  await page.getByRole('button',{name:'Switch section'}).click();
  assert.equal(await page.locator('[data-calculator-panel]').count(),0);
  await page.close();
  console.log(`Browser calculator passed at ${viewport.width}x${viewport.height}`);
 }
}finally{await browser.close();}
