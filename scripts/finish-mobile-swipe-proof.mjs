import { readFile, writeFile } from "node:fs/promises";

const cssPath = "src/reader/pdf-book-reader.css";
let css = await readFile(cssPath, "utf8");
const mobileMarker = `@media (max-width: 760px) {\n  .pdf-reader { grid-template-rows: 58px minmax(0, 1fr) 70px; }`;
if (!css.includes(mobileMarker)) throw new Error("Mobile reader media block not found");
css = css.replace(
  mobileMarker,
  `@media (max-width: 760px) {\n  .pdf-reader { grid-template-rows: 58px minmax(0, 1fr) 70px; }\n  .physical-reader-stage { place-items: start center; padding-top: 14px; }`,
);
await writeFile(cssPath, css, "utf8");

const testPath = "scripts/verify-physical-reader.mjs";
let test = await readFile(testPath, "utf8");
const oldSwipe = `  await mobilePage.locator(".physical-reader-stage").dispatchEvent("touchstart", { touches: [{ clientX: 330, clientY: 410 }] });\n  await mobilePage.locator(".physical-reader-stage").dispatchEvent("touchend", { changedTouches: [{ clientX: 70, clientY: 410 }] });`;
const newSwipe = `  await mobilePage.locator(".physical-reader-stage").evaluate((stage) => {\n    const start = new Touch({ identifier: 1, target: stage, clientX: 330, clientY: 410, screenX: 330, screenY: 410, pageX: 330, pageY: 410, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 });\n    stage.dispatchEvent(new TouchEvent("touchstart", { touches: [start], targetTouches: [start], changedTouches: [start], bubbles: true, cancelable: true }));\n    const end = new Touch({ identifier: 1, target: stage, clientX: 70, clientY: 410, screenX: 70, screenY: 410, pageX: 70, pageY: 410, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 });\n    stage.dispatchEvent(new TouchEvent("touchend", { touches: [], targetTouches: [], changedTouches: [end], bubbles: true, cancelable: true }));\n  });`;
if (!test.includes(oldSwipe)) throw new Error("Mobile swipe proof block not found");
test = test.replace(oldSwipe, newSwipe);
await writeFile(testPath, test, "utf8");
console.log("Aligned the mobile page with the top reading edge and completed the real touch-swipe proof.");
