import { readFile, writeFile } from "node:fs/promises";

async function replaceExact(path, before, after) {
  const source = await readFile(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${path}: expected one exact replacement, found ${count}`);
  }
  await writeFile(path, source.replace(before, after));
}

await replaceExact(
  "src/notverse/SetupWizard.tsx",
  '<div className="setup-brand"><span className="notverse-mark">▤</span><strong>NoTVerse</strong><small>Setup Wizard</small><b>{page + 1} / {pages}</b></div>',
  '<div className="setup-brand"><span className="notverse-mark" role="img" aria-label="NoTVerse" /><b>{page + 1} / {pages}</b></div>',
);

await replaceExact(
  "src/notverse/SetupWizard.tsx",
  'return <div className="setup-cover-page"><span className="cover-notebook">▤</span><h1>NoTVerse</h1><h2>Created for Nancy. Shared with the world.</h2><p>Every reader leaves something behind.<br />Sometimes it is only a Note.</p><em>Swipe up to begin</em></div>;',
  'return <div className="setup-cover-page"><span className="cover-notebook" role="img" aria-label="NoTVerse" /><h2>Created for Nancy. Shared with the world.</h2><p>Every reader leaves something behind.<br />Sometimes it is only a Note.</p><em>Swipe up to begin</em></div>;',
);

await replaceExact(
  "src/App.tsx",
  `        <a className="brand notverse-brand" href="#home" onClick={() => setActiveSection("home")}>
          <span>▤</span>
          <strong>NoTVerse</strong>
          <small className="notverse-origin">Created for Nancy.<br />Shared with the world.</small>
        </a>`,
  `        <a className="brand notverse-brand" href="#home" onClick={() => setActiveSection("home")} aria-label="NoTVerse Home">
          <span role="img" aria-label="NoTVerse" />
          <small className="notverse-origin">Created for Nancy.<br />Shared with the world.</small>
        </a>`,
);

await replaceExact(
  "src/App.tsx",
  '<div className="mobile-brand"><span>▤</span><strong>NoTVerse</strong></div>',
  '<div className="mobile-brand"><span role="img" aria-label="NoTVerse" /></div>',
);

await replaceExact(
  "scripts/verify-notverse-brand-mobile-chat.mjs",
  `    const setupWordmark = document.querySelector(".setup-brand > strong");
    const setupLabel = document.querySelector(".setup-brand > small");
    const duplicateTitle = document.querySelector(".setup-cover-page h1");
    if (!mark || !cover || !origin || !setupWordmark || !setupLabel || !duplicateTitle) return null;`,
  `    if (!mark || !cover || !origin) return null;`,
);

await replaceExact(
  "scripts/verify-notverse-brand-mobile-chat.mjs",
  `      originFont: getComputedStyle(origin).fontFamily,
      originStyle: getComputedStyle(origin).fontStyle,
      setupWordmarkDisplay: getComputedStyle(setupWordmark).display,
      setupLabelDisplay: getComputedStyle(setupLabel).display,
      duplicateTitleDisplay: getComputedStyle(duplicateTitle).display,`,
  `      originFont: getComputedStyle(origin).fontFamily,
      originStyle: getComputedStyle(origin).fontStyle,`,
);

await replaceExact(
  "scripts/verify-notverse-brand-mobile-chat.mjs",
  `  assert(setupVisual.setupWordmarkDisplay === "none", "setup header repeats the NoTVerse wordmark beside the approved artwork");
  assert(setupVisual.setupLabelDisplay === "none", "setup header still shows the rejected setup-wizard lockup");
  assert(setupVisual.duplicateTitleDisplay === "none", "setup cover repeats NoTVerse below artwork that already contains the name");`,
  `  assert(await setup.locator(".setup-brand > strong").count() === 0, "setup header still contains a duplicate NoTVerse wordmark");
  assert(await setup.locator(".setup-brand > small").count() === 0, "setup header still contains the rejected setup-wizard lockup");
  assert(await setup.locator(".setup-cover-page h1").count() === 0, "setup cover still contains a duplicate NoTVerse title");`,
);

await replaceExact(
  "scripts/verify-notverse-brand-mobile-chat.mjs",
  `    const duplicateWordmark = document.querySelector(".brand > strong");
    const origin = document.querySelector(".brand small");
    const hero = document.querySelector(".notverse-hero");
    if (!brand || !brandArtwork || !duplicateWordmark || !origin || !hero) return null;`,
  `    const origin = document.querySelector(".brand small");
    const hero = document.querySelector(".notverse-hero");
    if (!brand || !brandArtwork || !origin || !hero) return null;`,
);

await replaceExact(
  "scripts/verify-notverse-brand-mobile-chat.mjs",
  `      brandImage: getComputedStyle(brandArtwork).backgroundImage,
      brandBeforeContent: getComputedStyle(brand, "::before").content,
      duplicateWordmarkDisplay: getComputedStyle(duplicateWordmark).display,
      heroImage: getComputedStyle(hero, "::after").backgroundImage,`,
  `      brandImage: getComputedStyle(brandArtwork).backgroundImage,
      brandBeforeContent: getComputedStyle(brand, "::before").content,
      heroImage: getComputedStyle(hero, "::after").backgroundImage,`,
);

await replaceExact(
  "scripts/verify-notverse-brand-mobile-chat.mjs",
  `  assert(homeVisual.brandBeforeContent === "none" || homeVisual.brandBeforeContent === "normal", "sidebar still renders the rejected extra notebook symbol");
  assert(homeVisual.duplicateWordmarkDisplay === "none", "sidebar repeats NoTVerse beside artwork that already contains the name");`,
  `  assert(homeVisual.brandBeforeContent === "none" || homeVisual.brandBeforeContent === "normal", "sidebar still renders the rejected extra notebook symbol");
  assert(await home.locator(".brand > strong").count() === 0, "sidebar still contains a duplicate NoTVerse wordmark");`,
);

await replaceExact(
  "scripts/verify-notverse-brand-mobile-chat.mjs",
  `    const duplicateWordmark = document.querySelector(".mobile-brand > strong");
    if (!artwork || !duplicateWordmark) return null;
    return {
      artworkImage: getComputedStyle(artwork).backgroundImage,
      duplicateWordmarkDisplay: getComputedStyle(duplicateWordmark).display,
    };`,
  `    if (!artwork) return null;
    return {
      artworkImage: getComputedStyle(artwork).backgroundImage,
    };`,
);

await replaceExact(
  "scripts/verify-notverse-brand-mobile-chat.mjs",
  `  assert(mobileBrand?.artworkImage.includes("notverse-icon.webp"), "mobile header does not use the approved artwork");
  assert(mobileBrand?.duplicateWordmarkDisplay === "none", "mobile header repeats NoTVerse beside the approved artwork");`,
  `  assert(mobileBrand?.artworkImage.includes("notverse-icon.webp"), "mobile header does not use the approved artwork");
  assert(await mobile.locator(".mobile-brand > strong").count() === 0, "mobile header still contains a duplicate NoTVerse wordmark");`,
);

console.log("Clean NoTVerse markup staged from the verified workspace.");
