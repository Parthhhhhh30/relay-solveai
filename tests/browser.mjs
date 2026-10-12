import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const base=process.env.BASE_URL||'http://127.0.0.1:3000';
const browser=await chromium.launch();
await fs.mkdir('test-results',{recursive:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
// Authenticated CLI response headers stay in ignored test-results; never log cookies.
if(process.env.VERCEL_AUTH_COOKIE_FILE){
  const headers=await fs.readFile(process.env.VERCEL_AUTH_COOKIE_FILE,'utf8');
  const cookies=[...headers.matchAll(/^set-cookie:\s*([^=;\s]+)=([^;\r\n]*)/gim)]
    .map(([,name,value])=>({name,value,url:base,httpOnly:true,secure:true,sameSite:'None'}));
  assert.ok(cookies.length,'Authenticated CLI response must contain a cookie');
  await context.addCookies(cookies);
}
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const click=async(action,id)=>page.locator(`[data-action="${action}"]${id?`[data-id="${id}"]`:''}`).click();
const submit=async()=>{await page.locator('button[type="submit"]').click();await page.locator('#modal').waitFor({state:'hidden'});};
const nav=async(p)=>{if(await page.locator('#menuToggle').isVisible())await page.locator('#menuToggle').click();await page.locator(`[data-page="${p}"]`).click();};
const state=async()=>{const r=await context.request.get(`${base}/api/state`);assert.equal(r.status(),200);return r.json();};
try {
  await page.goto(base);await page.getByRole('heading',{name:'Operations, without dropped handoffs'}).waitFor();
  await page.screenshot({path:'test-results/desktop.png',fullPage:true});
  await nav('people');await click('person',1);
  await click('activate',1);await page.locator('button[type="submit"]').click();
  await page.locator('#toast.error').waitFor();assert.equal((await state()).people.find(p=>p.id===1).status,'joining');
  await page.locator('#modalClose').click();
  for(const id of [2,3]){await click('access-action',id);await page.getByLabel('Operator note / confirmation').fill('Synthetic browser grant QA');await submit();}
  await click('device-action',1);await page.getByLabel('Asset tag').fill('DEMO-QA-001');await page.getByLabel('Operator note / confirmation').fill('Synthetic device handover');await submit();
  await click('activate',1);await submit();assert.equal((await state()).people.find(p=>p.id===1).status,'active');
  await nav('reviews');await click('review',1);await click('question',1);assert.equal(await page.getByRole('button',{name:'Record approval',exact:true}).isDisabled(),true);await page.locator('#modalClose').click();
  await nav('evidence');await click('evidence-detail',1);assert.equal(await page.getByRole('button',{name:'Approve current version'}).isDisabled(),true);
  await page.getByLabel('Document reference',{exact:true}).fill(`DEMO-BROWSER-REVISION-${Date.now()}`);await submit();
  await click('evidence-detail',1);await page.getByRole('button',{name:'Approve current version'}).click();await page.getByLabel('Recorded reviewer name').fill('Synthetic Evidence Reviewer');await submit();
  assert.notEqual((await state()).questions.find(q=>q.id===1).health,'approved');
  await nav('reviews');await click('review',1);await click('question',1);await page.getByRole('button',{name:'Record approval',exact:true}).click();await page.getByLabel('Reviewer name',{exact:true}).fill('Synthetic Security Reviewer');await submit();
  await click('package',1);await page.getByRole('heading',{name:'Included answers'}).waitFor();
  const downloadWait=page.waitForEvent('download');await page.getByRole('link',{name:'Download approved-only CSV'}).click();
  const download=await downloadWait;await download.saveAs('test-results/approved-only.csv');
  const csv=await fs.readFile('test-results/approved-only.csv','utf8');assert.match(csv,/Synthetic Security Reviewer/);assert.doesNotMatch(csv,/How frequently are employee permissions reviewed/);
  await page.locator('#modalClose').click();
  await nav('people');await click('person',2);await click('finish-offboarding',2);await page.locator('button[type="submit"]').click();await page.locator('#toast.error').waitFor();await page.locator('#modalClose').click();
  for(const id of [5,6]){await click('access-action',id);await page.getByLabel('Operator note / confirmation').fill('Synthetic browser revocation QA');await submit();}
  await click('device-action',2);await page.getByLabel('Operator note / confirmation').fill('Synthetic return QA');await submit();await click('finish-offboarding',2);await submit();
  assert.equal((await state()).people.find(p=>p.id===2).status,'offboarded');
  await page.reload();await page.getByRole('heading',{name:'Operations, without dropped handoffs'}).waitFor();assert.equal((await state()).people.find(p=>p.id===2).status,'offboarded');
  await page.setViewportSize({width:390,height:844});
  for(const p of ['people','reviews','evidence','operations','activity','overview']){await nav(p);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,`Mobile overflow: ${p}`);}
  await nav('operations');await click('new-task');
  await page.getByLabel('Work item').fill('Synthetic mobile GTM follow-up');
  await page.getByLabel('Accountable owner').fill('Synthetic QA Operator');
  await page.getByLabel('Workstream').selectOption('GTM');await submit();
  const task=(await state()).tasks.find(t=>t.title==='Synthetic mobile GTM follow-up');
  await click('task',task.id);await page.getByLabel('Current progress').selectOption('done');
  await page.getByLabel('Evidence / follow-up note').fill('Synthetic venue follow-up recorded');await submit();
  assert.equal((await state()).tasks.find(t=>t.id===task.id).status,'done');
  await click('new-task');await page.keyboard.press('Escape');assert.equal(await page.locator('#modal').isHidden(),true);
  await nav('overview');await page.screenshot({path:'test-results/mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('BROWSER PASS: desktop/mobile navigation, denied readiness, access/device records, source invalidation, fresh evidence and answer reviews, CSV download, denied/complete offboarding, reload persistence, no page errors');
} finally {await browser.close();}
