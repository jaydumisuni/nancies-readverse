import assert from 'node:assert/strict';
export const id='notverse';
export const timeline={id:'comments-keyboard-return',steps:['notes-ready','comments-open','composer-focused','keyboard-open','after-send','keyboard-closed-before-back','after-back']};
function preferences(){localStorage.setItem('notverse.preferences',JSON.stringify({setupComplete:true,noteFont:'handwritten',readingInterests:['Manga','Novels','PDFs'],discoveryMethods:['title','memory','link']}));}
async function prepare(page,target){await page.goto(target,{waitUntil:'networkidle'});await page.evaluate(preferences);await page.reload({waitUntil:'networkidle'});}

export async function captureTimeline({page,device,target,utils}){
  const {settle,rect,waitForCssPx,emit,navState}=utils;
  const keyboardHeight=Math.max(480,device.height-324);
  await prepare(page,target);
  await page.getByRole('button',{name:'Notes',exact:true}).last().click();
  await page.locator('.notes-social-experience').waitFor();
  await settle(page);
  const paper=page.locator('.notes-social-experience .note-paper').first();
  const paperColor=await paper.evaluate(n=>getComputedStyle(n).backgroundColor);
  assert.equal(paperColor,'rgb(255, 255, 255)',`${device.name}: timeline Note paper ${paperColor}`);
  await emit('notes-ready',{paperColor});

  await page.getByRole('button',{name:'Comment on Note',exact:true}).click();
  await page.locator('.replies-backdrop').waitFor();
  assert.equal(await page.locator('body.notverse-comments-open').count(),1,`${device.name}: Comments state missing`);
  const navCovered=await navState(page);
  assert.equal(navCovered?.inert,true,`${device.name}: nav not inert under Comments`);
  assert.equal(navCovered?.ariaHidden,'true',`${device.name}: nav not aria-hidden under Comments`);
  await emit('comments-open',{nav:navCovered});

  const input=page.getByRole('textbox',{name:'Write a comment'});
  await input.fill(`timeline ${device.id}`);await input.focus();
  assert.equal(await input.evaluate(n=>document.activeElement===n),true,`${device.name}: composer focus missing`);
  await emit('composer-focused',{inputFocused:true});

  await page.setViewportSize({width:device.width,height:keyboardHeight});
  await waitForCssPx(page,'--notverse-mobile-vv-height',keyboardHeight);
  const formKeyboard=await rect(page.locator('.replies-drawer > form'));
  assert(formKeyboard.bottom>=keyboardHeight-5&&formKeyboard.bottom<=keyboardHeight+2,`${device.name}: timeline composer ${formKeyboard.bottom}/${keyboardHeight}`);
  const hit=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest?.('.mobile-nav.notverse-mobile-nav')?'nav':'surface',{x:Math.round(device.width/2),y:Math.max(1,keyboardHeight-24)});
  assert.equal(hit,'surface',`${device.name}: nav paints above Comments during keyboard`);
  await emit('keyboard-open',{keyboardHeight,form:formKeyboard,hit});

  const before=await page.locator('.replies-list article').count();
  await page.getByRole('button',{name:'Send',exact:true}).tap();
  await page.waitForFunction(count=>document.querySelectorAll('.replies-list article').length>count,before);
  const formAfterSend=await rect(page.locator('.replies-drawer > form'));
  await emit('after-send',{commentsBefore:before,commentsAfter:await page.locator('.replies-list article').count(),form:formAfterSend});

  await input.evaluate(n=>n.blur());
  await page.setViewportSize({width:device.width,height:device.height});
  await waitForCssPx(page,'--notverse-mobile-vv-height',device.height);
  assert.equal(await page.locator('body.notverse-comments-open').count(),1,`${device.name}: Comments closed before Back`);
  const beforeBackNav=await navState(page);
  assert.equal(beforeBackNav?.display,'grid',`${device.name}: nav unpainted before Back`);
  assert.equal(beforeBackNav?.visibility,'visible',`${device.name}: nav invisible before Back`);
  assert((beforeBackNav?.opacity??0)>=.99,`${device.name}: nav opacity before Back ${beforeBackNav?.opacity}`);
  assert.equal(beforeBackNav?.pointerEvents,'none',`${device.name}: nav interactive before Back`);
  await emit('keyboard-closed-before-back',{nav:beforeBackNav});

  await page.getByRole('button',{name:'Back to Notes'}).click();
  await page.waitForFunction(()=>!document.body.classList.contains('notverse-comments-open'));
  await settle(page);
  const restored=await navState(page);
  assert.equal(restored?.display,'grid',`${device.name}: restored nav display`);
  assert.equal(restored?.visibility,'visible',`${device.name}: restored nav visibility`);
  assert((restored?.opacity??0)>=.99,`${device.name}: restored nav opacity`);
  assert.equal(restored?.pointerEvents,'auto',`${device.name}: restored nav interaction`);
  assert.equal(restored?.inert,false,`${device.name}: restored nav inert`);
  await emit('after-back',{nav:restored});
  return {keyboardHeight,paperColor,frameCount:timeline.steps.length};
}
