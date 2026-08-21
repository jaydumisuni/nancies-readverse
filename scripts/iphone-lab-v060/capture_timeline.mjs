#!/usr/bin/env node
import { chromium, webkit } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

function args(argv){
  const out={engine:'webkit',target:'http://127.0.0.1:4173',devices:'scripts/iphone-lab-v060/devices.json',out:'engineering-evidence/iphone-visual-lab-timeline'};
  for(let i=2;i<argv.length;i+=2){const k=argv[i]?.replace(/^--/,'');if(!k||argv[i+1]===undefined)throw new Error(`bad argument near ${argv[i]}`);out[k]=argv[i+1];}
  if(!out.adapter)throw new Error('--adapter is required');
  return out;
}
const opt=args(process.argv);
const engines={webkit,chromium};
const engine=engines[opt.engine];
if(!engine)throw new Error(`unsupported engine: ${opt.engine}`);
const registry=JSON.parse(await readFile(opt.devices,'utf8'));
const adapter=await import(pathToFileURL(path.resolve(opt.adapter)).href);
if(typeof adapter.captureTimeline!=='function')throw new Error(`adapter ${adapter.id||opt.adapter} does not export captureTimeline()`);
await mkdir(opt.out,{recursive:true});
const report={schema:'ttg.iphone-visual-lab-timeline.v1',adapter:adapter.id||opt.adapter,target:opt.target,engine:opt.engine,timeline:adapter.timeline?.id||'timeline',expectedSteps:adapter.timeline?.steps||[],createdAt:new Date().toISOString(),devices:registry.profiles.length,cases:[],errors:[]};

async function settle(page){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function rect(locator){return locator.evaluate(node=>{const r=node.getBoundingClientRect();return {top:r.top,right:r.right,bottom:r.bottom,left:r.left,width:r.width,height:r.height};});}
async function waitForCssPx(page,property,expected,timeout=3000){await page.waitForFunction(({property,expected})=>{const v=Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(property));return Number.isFinite(v)&&Math.abs(v-expected)<=3;},{property,expected},{timeout});await settle(page);}
async function navState(page){const nav=page.locator('.mobile-nav.notverse-mobile-nav');if(await nav.count()===0)return null;return nav.evaluate(node=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();return {display:s.display,visibility:s.visibility,opacity:Number(s.opacity),pointerEvents:s.pointerEvents,zIndex:s.zIndex,inert:node.hasAttribute('inert'),ariaHidden:node.getAttribute('aria-hidden'),rect:{top:r.top,right:r.right,bottom:r.bottom,left:r.left,width:r.width,height:r.height},active:node.querySelector('button.active')?.textContent?.trim()||null};});}
async function commonState(page){const viewport=await page.evaluate(()=>({innerWidth:window.innerWidth,innerHeight:window.innerHeight,visualViewport:window.visualViewport?{width:window.visualViewport.width,height:window.visualViewport.height,offsetTop:window.visualViewport.offsetTop,offsetLeft:window.visualViewport.offsetLeft}:null,cssVvHeight:getComputedStyle(document.documentElement).getPropertyValue('--notverse-mobile-vv-height').trim(),bodyClasses:[...document.body.classList],htmlClasses:[...document.documentElement.classList],activeElement:document.activeElement?.getAttribute?.('aria-label')||document.activeElement?.tagName||null}));return {...viewport,nav:await navState(page)};}

const browser=await engine.launch({headless:true});
try{
  for(const device of registry.profiles){
    const context=await browser.newContext({viewport:{width:device.width,height:device.height},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    const page=await context.newPage();
    const consoleErrors=[];page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});page.on('pageerror',e=>consoleErrors.push(String(e)));
    const frames=[];let frameIndex=0;
    async function emit(step,metadata={}){frameIndex+=1;await settle(page);const dir=path.join(opt.out,adapter.timeline?.id||'timeline',device.id);await mkdir(dir,{recursive:true});const file=`${String(frameIndex).padStart(2,'0')}-${step}.png`;const target=path.join(dir,file);await page.screenshot({path:target,fullPage:false});frames.push({index:frameIndex,step,screenshot:path.relative(opt.out,target).replaceAll('\\','/'),state:await commonState(page),metadata});}
    try{const result=await adapter.captureTimeline({page,device,target:opt.target,outDir:opt.out,utils:{settle,rect,waitForCssPx,emit,commonState,navState}});report.cases.push({...device,frames,result,consoleErrors});}
    catch(error){report.errors.push({device:device.id,error:error instanceof Error?(error.stack||error.message):String(error),frames,consoleErrors});}
    finally{await context.close();}
  }
}finally{await browser.close();}
report.ok=report.errors.length===0&&report.cases.length===registry.profiles.length&&report.cases.every(c=>c.frames.length===report.expectedSteps.length);
await writeFile(path.join(opt.out,'timeline-report.json'),JSON.stringify(report,null,2)+'\n');
if(!report.ok){console.error(JSON.stringify(report.errors,null,2));process.exit(1);}
console.log(`iPhone Visual Lab timeline passed: ${report.cases.length} device viewports / ${report.expectedSteps.length} steps each.`);
