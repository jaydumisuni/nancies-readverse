from pathlib import Path
import json

manifest_path = Path("public/manifest.webmanifest")
manifest = json.loads(manifest_path.read_text())
manifest.update({
    "name": "NoTVerse",
    "short_name": "NoTVerse",
    "description": "Created for Nancy. Shared with the world. Find it, verify it, read it, write a Note and meet readers in the same Verse.",
})
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

index_path = Path("index.html")
index = index_path.read_text()
index = index.replace("Nancy's ReadVerse", "NoTVerse").replace("Nancy’s ReadVerse", "NoTVerse")
index = index.replace("ReadVerse", "NoTVerse")
index_path.write_text(index)

wrangler_path = Path("wrangler.jsonc")
wrangler = json.loads(wrangler_path.read_text())
wrangler.setdefault("vars", {})["APP_NAME"] = "NoTVerse"
wrangler_path.write_text(json.dumps(wrangler, indent=2) + "\n")

package_path = Path("package.json")
package = json.loads(package_path.read_text())
package["scripts"]["check:social"] = "tsc --noEmit -p social-worker/tsconfig.json"
package["scripts"]["build"] = package["scripts"]["build"].replace("npm run verify:notverse", "npm run verify:notverse && npm run check:social")
package_path.write_text(json.dumps(package, indent=2) + "\n")

rules_path = Path("docs/READVERSE_PRODUCT_RULES.md")
rules = rules_path.read_text()
rules = rules.replace("# Nancy’s ReadVerse — Canonical Product Rules", "# NoTVerse — Canonical Product Rules")
rules += '''\n\n## NoTVerse product expansion\n\n- Exact visible name: **NoTVerse**.\n- Exact origin line: **Created for Nancy. Shared with the world.**\n- Setup is swipe-only and uses the existing twelve approved companions.\n- Notes are physical notebook pages flipped up and down, never an endless social-card feed.\n- Social data belongs in the isolated `social-worker` service; copied reading books never belong in its R2 bucket.\n'''
rules_path.write_text(rules)

print("Materialised NoTVerse metadata and isolated social build")
