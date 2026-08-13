import { chromium } from "playwright";
const browser=await chromium.launch({headless:true});
for(const [width,viewportHeight,keyboardBottom] of [[360,640,420],[390,844,524]]){
 const context=await browser.newContext({viewport:{width,height:viewportHeight},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const page=await context.newPage();
 await page.goto("http://127.0.0.1:4173",{waitUntil:"networkidle"});
 await page.evaluate(()=>localStorage.setItem("notverse.preferences",JSON.stringify({setupComplete:true,noteFont:"handwritten",readingInterests:["Manga","Novels","PDFs"],discoveryMethods:["title","memory","link"]})));
 await page.reload({waitUntil:"networkidle"});
 await page.locator(".notverse-mobile-nav button").filter({hasText:"Inbox"}).click();
 const input=page.getByRole("textbox",{name:"Private message"}); await input.waitFor(); await input.fill("diagnostic draft"); await input.focus();
 await page.evaluate(({width,height})=>{const v=visualViewport;Object.defineProperties(v,{offsetTop:{configurable:true,value:0},offsetLeft:{configurable:true,value:0},width:{configurable:true,value:width},height:{configurable:true,value:height}});v.dispatchEvent(new Event("scroll"));v.dispatchEvent(new Event("resize"));},{width,height:keyboardBottom});
 await page.waitForTimeout(950);
 const state=await page.evaluate(()=>{const inspect=(sel)=>{const n=document.querySelector(sel);if(!(n instanceof HTMLElement))return null;const r=n.getBoundingClientRect(),s=getComputedStyle(n);return{rect:{top:r.top,bottom:r.bottom,height:r.height},clientHeight:n.clientHeight,offsetHeight:n.offsetHeight,scrollHeight:n.scrollHeight,display:s.display,position:s.position,height:s.height,minHeight:s.minHeight,maxHeight:s.maxHeight,gridTemplateRows:s.gridTemplateRows,alignSelf:s.alignSelf,overflow:s.overflow,paddingTop:s.paddingTop,paddingBottom:s.paddingBottom,marginTop:s.marginTop,marginBottom:s.marginBottom};};const rs=getComputedStyle(document.documentElement);return{innerHeight,visualViewport:{height:visualViewport.height,offsetTop:visualViewport.offsetTop},bodyClass:document.body.className,vars:{vvHeight:rs.getPropertyValue("--notverse-vv-height").trim(),vvBottom:rs.getPropertyValue("--notverse-vv-bottom").trim()},shell:inspect(".main-shell.notverse-shell"),inbox:inspect(".inbox-view"),layout:inspect(".inbox-layout"),main:inspect(".inbox-layout > main"),header:inspect(".inbox-layout > main > header"),thread:inspect(".inbox-layout .message-thread"),form:inspect(".inbox-layout main > form")};});
 console.log("INBOX_DIAGNOSTIC",JSON.stringify({width,viewportHeight,keyboardBottom,state}));
 await context.close();
}
await browser.close();
