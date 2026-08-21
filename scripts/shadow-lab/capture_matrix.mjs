#!/usr/bin/env node
import { chromium, webkit } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

function args(argv){
  const out={engine:'webkit',target:'http://127.0.0.1:4173',devices:'scripts/shadow-lab/devices.json',out:'engineering-evidence/iphone-visual-lab-v050'};
  for(let i=2;i<argv.length;i+=2){const k=argv[i]?.replace(/^--/,''); if(!k||argv[i+1]===undefined) throw new Error(`bad argument near ${argv[i]}`); out[k]=argv[i+1];}
  if(!out.adapter) throw new Error('--adapter is required');
  return out;
}
const opt=args(process.argv);
const engines={webkit,chromium};
const engine=engines[opt.engine];
if(!engine) throw new Error(`unsupported engine: ${opt.engine}`);
const registry=JSON.parse(await readFile(opt.devices,'utf8'));
const adapter=await import(pathToFileURL(path.resolve(opt.adapter)).href);
const profiles=registry.profiles;
await mkdir(opt.out,{recursive:true});
const report={schema:'ttg.iphone-visual-lab-matrix.v1',adapter:adapter.id||opt.adapter,target:opt.target,engine:opt.engine,createdAt:new Date().toISOString(),devices:profiles.length,expectedScenes:adapter.scenes||[],cases:[],errors:[]};

async function settle(page){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function rect(locator){return locator.evaluate(node=>{const r=node.getBoundingClientRect();return {top:r.top,right:r.right,bottom:r.bottom,left:r.left,width:r.width,height:r.height};});}
async function waitForCssPx(page,property,expected,timeout=3000){await page.waitForFunction(({property,expected})=>{const v=Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(property));return Number.isFinite(v)&&Math.abs(v-expected)<=3;},{property,expected},{timeout});await settle(page);}
async function shot(page,scene,device,file){const dir=path.join(opt.out,scene,device.id);await mkdir(dir,{recursive:true});const target=path.join(dir,file);await page.screenshot({path:target,fullPage:false});return path.relative(opt.out,target).replaceAll('\\','/');}
const utils={settle,rect,waitForCssPx,shot};

const browser=await engine.launch({headless:true});
try{
  for(const device of profiles){
    const context=await browser.newContext({viewport:{width:device.width,height:device.height},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    const page=await context.newPage();
    const consoleErrors=[];
    page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
    page.on('pageerror',e=>consoleErrors.push(String(e)));
    try{
      const result=await adapter.capture({page,device,target:opt.target,outDir:opt.out,utils});
      report.cases.push({...device,...result,consoleErrors});
    }catch(error){report.errors.push({device:device.id,error:error instanceof Error?(error.stack||error.message):String(error)});}
    finally{await context.close();}
  }
}finally{await browser.close();}
report.ok=report.errors.length===0&&report.cases.length===profiles.length;
await writeFile(path.join(opt.out,'report.json'),JSON.stringify(report,null,2)+'\n');
if(!report.ok){console.error(JSON.stringify(report.errors,null,2));process.exit(1);}
console.log(`iPhone Visual Lab matrix passed: ${report.cases.length} device viewports / ${report.expectedScenes.length} scenes each.`);
