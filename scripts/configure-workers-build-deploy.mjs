import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

const generatedConfig = resolve("dist/nancies_readverse/wrangler.json");
const redirectFile = resolve(".wrangler/deploy/config.json");

await access(generatedConfig);
await mkdir(dirname(redirectFile), { recursive: true });

let configPath = relative(dirname(redirectFile), generatedConfig).split(sep).join("/");
if (!configPath.startsWith(".")) configPath = `./${configPath}`;

const redirect = { configPath };
await writeFile(redirectFile, `${JSON.stringify(redirect, null, 2)}\n`);

const written = JSON.parse(await readFile(redirectFile, "utf8"));
if (written.configPath !== configPath) {
  throw new Error("Wrangler generated-config redirect was not written correctly");
}

console.log(`Workers Builds deploy redirect: ${redirectFile} -> ${generatedConfig}`);
