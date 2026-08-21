import assert from 'node:assert/strict';
export const id='notverse';
export const scenes=['notes','comments-keyboard','comments-return-nav','chat-keyboard'];

function preferences(){localStorage.setItem('notverse.preferences',JSON.stringify({setupComplete:true,noteFont:'handwritten',readingInterests:['Manga','Novels','PDFs'],discoveryMethods:['title','memory','link']}));}
async function prepare(page,target){await page.goto(target,{waitUntil:'networkidle'});await page.evaluate(preferences);await page.reload({waitUntil:'networkidle'});}

export async function capture({page,device,target,utils}){
  const {settle,rect,waitForCssPx,shot}=utils;
  const keyboardHeight=Math.max(480,device.height-324);
  await prepare(page,target);
  await page.getByRole('button',{name:'Notes',exact:true}).last().click();
  await page.locator('.notes-social-experience').waitFor(); await settle(page);
  const paper=page.locator('.notes-social-experience .note-paper').first();
  const paperColor=await paper.evaluate(n=>getComputedStyle(n).backgroundColor);
  assert.equal(paperColor,'rgb(255, 255, 255)',`${device.name}: Note paper ${paperColor}`);
  const activity=await rect(page.locator('.notes-social-experience .notes-activity-button'));
  assert(activity.width>=42&&activity.width<=46,`${device.name}: Activity width ${activity.width}`);
  assert(activity.height>=42&&activity.height<=46,`${device.name}: Activity height ${activity.height}`);
  await shot(page,'notes',device,'webkit-notes.png');

  await page.getByRole('button',{name:'Comment on Note',exact:true}).click();
  await page.locator('.replies-backdrop').waitFor();
  const input=page.getByRole('textbox',{name:'Write a comment'});
  await input.fill(`iPhone lab ${device.id}`); await input.focus();
  await page.setViewportSize({width:device.width,height:keyboardHeight});
  await waitForCssPx(page,'--notverse-mobile-vv-height',keyboardHeight);
  const commentsForm=await rect(page.locator('.replies-drawer > form'));
  assert(commentsForm.bottom>=keyboardHeight-5&&commentsForm.bottom<=keyboardHeight+2,`${device.name}: Comments composer ${commentsForm.bottom}/${keyboardHeight}`);
  const hit=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest?.('.mobile-nav.notverse-mobile-nav')?'nav':'surface',{x:Math.round(device.width/2),y:Math.max(1,keyboardHeight-24)});
  assert.equal(hit,'surface',`${device.name}: nav paints above Comments`);
  const before=await page.locator('.replies-list article').count();
  await page.getByRole('button',{name:'Send',exact:true}).tap();
  await page.waitForFunction(count=>document.querySelectorAll('.replies-list article').length>count,before);
  await shot(page,'comments-keyboard',device,'webkit-comments-keyboard.png');

  await input.evaluate(n=>n.blur()); await page.setViewportSize({width:device.width,height:device.height});
  await waitForCssPx(page,'--notverse-mobile-vv-height',device.height);
  await page.getByRole('button',{name:'Back to Notes'}).click();
  await page.waitForFunction(()=>!document.body.classList.contains('notverse-comments-open')); await settle(page);
  const nav=page.locator('.mobile-nav.notverse-mobile-nav');
  const restoredNav=await nav.evaluate(node=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();return {display:s.display,visibility:s.visibility,opacity:Number(s.opacity),pointerEvents:s.pointerEvents,width:r.width,height:r.height};});
  assert.equal(restoredNav.display,'grid'); assert.equal(restoredNav.visibility,'visible'); assert(restoredNav.opacity>=.99); assert.equal(restoredNav.pointerEvents,'auto');
  await shot(page,'comments-return-nav',device,'webkit-comments-return-nav.png');

  await prepare(page,target); await page.locator('.floating-companion').click(); await page.locator('.companion-panel.open').waitFor();
  const chatInput=page.locator('.companion-panel.open .chat-input input'); await chatInput.fill('iPhone lab keyboard proof'); await chatInput.focus();
  await page.setViewportSize({width:device.width,height:keyboardHeight}); await waitForCssPx(page,'--notverse-mobile-vv-height',keyboardHeight);
  const chat=await rect(page.locator('.companion-panel.open')); assert(Math.abs(chat.width-device.width)<=2); assert(Math.abs(chat.height-keyboardHeight)<=3);
  const composer=await rect(page.locator('.companion-panel.open .chat-input')); assert(composer.bottom>=keyboardHeight-5&&composer.bottom<=keyboardHeight+2);
  await shot(page,'chat-keyboard',device,'webkit-chat-keyboard.png');
  return {keyboardHeight,paperColor,activity,commentsForm,restoredNav,chat,composer};
}
