from pathlib import Path
p=Path('scripts/prove-notes-social-loop.mjs')
text=p.read_text()
old='await replyInput.fill(replyText);await page.getByRole("button",{name:"Send",exact:true}).click();await page.getByText(replyText,{exact:true}).waitFor();'
new='await replyInput.fill(replyText);const replySend=page.locator(".replies-drawer>form").getByRole("button",{name:"Send",exact:true});await replySend.tap();await page.waitForFunction(()=>document.querySelector(".replies-drawer input")?.value==="");await page.getByText(replyText,{exact:true}).waitFor();'
if text.count(old)!=1: raise SystemExit(f'reply target marker mismatch: {text.count(old)}')
p.write_text(text.replace(old,new,1))
print('Scoped social reply proof to a real mobile tap on the Replies control.')
