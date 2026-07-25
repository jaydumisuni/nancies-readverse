import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const appPath = resolve(root, "src/App.tsx");
const stylesPath = resolve(root, "src/styles.css");

let app = await readFile(appPath, "utf8");
let styles = await readFile(stylesPath, "utf8");

const oldMarkup = '<div className="mobile-brand">ReadVerse</div>';
const newMarkup = `<div className="mobile-brand" aria-label="Nancy's ReadVerse">
            <span>Nancy&apos;s</span>
            <strong>READVERSE</strong>
          </div>`;

if (!app.includes(oldMarkup) && !app.includes('aria-label="Nancy\'s ReadVerse"')) {
  throw new Error("Mobile brand markup was not found in the hydrated UI");
}
app = app.replace(oldMarkup, newMarkup);

const oldCss = `.mobile-brand {
    display: block;
    font-family: Georgia, serif;
    color: var(--accent-2);
    font-style: italic;
    font-weight: 700;
  }`;
const newCss = `.mobile-brand {
    display: grid;
    flex: 0 0 auto;
    min-width: 108px;
    line-height: 1;
    color: var(--accent-2);
  }
  .mobile-brand span {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1.36rem;
    font-style: italic;
    font-weight: 700;
    letter-spacing: -.03em;
    white-space: nowrap;
    text-shadow: 0 0 18px var(--accent-glow);
  }
  .mobile-brand strong {
    margin-top: 3px;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    font-size: .49rem;
    font-style: normal;
    font-weight: 800;
    letter-spacing: .26em;
    color: var(--text);
    white-space: nowrap;
  }`;

if (!styles.includes(oldCss) && !styles.includes('.mobile-brand span {')) {
  throw new Error("Mobile brand CSS block was not found in the hydrated UI");
}
styles = styles.replace(oldCss, newCss);

await writeFile(appPath, app, "utf8");
await writeFile(stylesPath, styles, "utf8");

const verifiedApp = await readFile(appPath, "utf8");
const verifiedStyles = await readFile(stylesPath, "utf8");
if (!verifiedApp.includes('aria-label="Nancy\'s ReadVerse"')) {
  throw new Error("Nancy's mobile brand markup was not written");
}
if (!verifiedStyles.includes('.mobile-brand strong {')) {
  throw new Error("Nancy's mobile brand styling was not written");
}

console.log("Restored stacked Nancy's / READVERSE mobile branding.");
