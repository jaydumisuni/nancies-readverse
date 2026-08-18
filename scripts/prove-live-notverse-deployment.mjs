import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";

const out = "engineering-evidence/live-deployment";
await mkdir(out, { recursive: true });

function assetNames(html) {
  const matches = [...html.matchAll(/(?:src|href)=["']([^"']*\/assets\/index-[^"']+\.(?:js|css))["']/g)];
  return [...new Set(matches.map((match) => match[1].split("/").pop()))].sort();
}

const localHtml = await readFile("dist/client/index.html", "utf8");
const localAssets = assetNames(localHtml);
assert(localAssets.some((name) => name.endsWith(".css")), "local production build CSS asset missing");
assert(localAssets.some((name) => name.endsWith(".js")), "local production build JS asset missing");

const httpsResponse = await fetch("https://notverse.1ink.online/", {
  redirect: "follow",
  headers: { "cache-control": "no-cache", pragma: "no-cache", "user-agent": "NoTVerse-deployment-proof/1.0" },
});
const liveHtml = await httpsResponse.text();
const liveAssets = assetNames(liveHtml);

const httpResponse = await fetch("http://notverse.1ink.online/", {
  redirect: "manual",
  headers: { "cache-control": "no-cache", pragma: "no-cache", "user-agent": "NoTVerse-deployment-proof/1.0" },
});

const evidence = {
  checkedAt: new Date().toISOString(),
  https: {
    status: httpsResponse.status,
    finalUrl: httpsResponse.url,
    assets: liveAssets,
    server: httpsResponse.headers.get("server"),
    cacheStatus: httpsResponse.headers.get("cf-cache-status"),
  },
  http: {
    status: httpResponse.status,
    location: httpResponse.headers.get("location"),
  },
  localAssets,
  liveAssets,
  assetMatch: JSON.stringify(localAssets) === JSON.stringify(liveAssets),
};

console.log(JSON.stringify(evidence, null, 2));
await writeFile(`${out}/live-deployment.json`, `${JSON.stringify(evidence, null, 2)}\n`);

assert(httpsResponse.ok, `live HTTPS returned ${httpsResponse.status}`);
assert.equal(new URL(httpsResponse.url).protocol, "https:", `live request did not remain HTTPS: ${httpsResponse.url}`);
assert.deepEqual(liveAssets, localAssets, `live assets do not match canonical production build: live=${liveAssets.join(",")} local=${localAssets.join(",")}`);
