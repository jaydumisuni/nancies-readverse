import { rm } from "node:fs/promises";

for (const path of ["dist", ".wrangler/deploy"]) {
  await rm(path, { recursive: true, force: true });
}

console.log("Removed stale build and deploy output.");
