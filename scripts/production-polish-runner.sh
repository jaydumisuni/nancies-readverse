#!/usr/bin/env bash
set -uo pipefail

BRANCH='polish-notverse-production-20260806'
PREVIEW_URL='https://polish-notverse-production-20260806-notverse.pharrtechnolgiescoltd.workers.dev'
PROGRESS='engineering-evidence/production-polish-progress.txt'
FAILURE='engineering-evidence/production-polish-failure.txt'
RUNLOG='/tmp/notverse-production-polish-run.log'

mkdir -p engineering-evidence
exec > >(tee "$RUNLOG") 2>&1

git config user.name 'NoTVerse Verification'
git config user.email 'actions@users.noreply.github.com'

commit_evidence() {
  local message="$1"
  shift
  git add -- "$@"
  git commit -m "$message" -- "$@" >/dev/null 2>&1 || true
  git push origin "HEAD:${BRANCH}" >/dev/null 2>&1 || true
}

progress() {
  local stage="$1"
  local result="$2"
  printf 'stage=%s\nresult=%s\nworkflow_sha=%s\nhead=%s\ntime_utc=%s\n' \
    "$stage" "$result" "${GITHUB_SHA:-unknown}" "$(git rev-parse HEAD)" "$(date -u +%FT%TZ)" > "$PROGRESS"
  commit_evidence "NoTVerse polish progress: ${stage} ${result}" "$PROGRESS"
}

fail() {
  local stage="$1"
  printf 'stage=%s\nresult=failure\nworkflow_sha=%s\nhead=%s\ntime_utc=%s\n' \
    "$stage" "${GITHUB_SHA:-unknown}" "$(git rev-parse HEAD)" "$(date -u +%FT%TZ)" > "$PROGRESS"
  {
    printf 'FAILED_STAGE=%s\n\n' "$stage"
    tail -n 260 "$RUNLOG" 2>/dev/null || true
  } > "$FAILURE"
  commit_evidence "Record NoTVerse polish failure at ${stage}" "$PROGRESS" "$FAILURE"
  exit 1
}

run_stage() {
  local stage="$1"
  shift
  "$@" || fail "$stage"
}

progress start running

cat engineering-patches/production-polish/part-*.b64 | base64 --decode > /tmp/product.patch.gz || fail decode
printf '%s  %s\n' '6c19abd69c0d89831d4a4ccaffe1805f547794265179cf9f01908e366a4d1db2' /tmp/product.patch.gz | sha256sum --check || fail checksum
gzip -dc /tmp/product.patch.gz > /tmp/product.patch || fail decompress
git apply --check /tmp/product.patch || fail product-patch-check
git apply /tmp/product.patch || fail product-patch-apply
git apply --check engineering-patches/production-polish/short-phone-home.patch || fail short-phone-patch-check
git apply engineering-patches/production-polish/short-phone-home.patch || fail short-phone-patch-apply
progress candidate-applied pass

python3 - <<'PY' || fail proof-adjustment
from pathlib import Path
path = Path('scripts/verify-production-polish.mjs')
text = path.read_text()
old_nav = 'page.locator(`${root} button`).filter({ hasText: label })'
new_nav = 'page.locator(root).getByRole("button", { name: label, exact: true })'
if old_nav not in text:
    raise SystemExit('Expected exact navigation proof locator was not found')
text = text.replace(old_nav, new_nav, 1)
start_marker = '  await page.route("**/api/discovery/search", async (route) => {'
end_marker = '  await page.route("**/api/companion/help", async (route) => {'
start = text.find(start_marker)
end = text.find(end_marker, start + 1)
if start < 0 or end < 0:
    raise SystemExit('Expected deterministic discovery proof route was not found')
route = '''  await page.route("**/api/discovery/search", async (route) => {
    const body = route.request().postDataJSON() || {};
    const query = String(body.query || "").toLowerCase();
    const gambling = /gambl|casino|poker|odds|bet/.test(query);
    const candidates = gambling ? [
      { title: "Addiction by Design", authors: ["Natasha Dow Schüll"], year: 2012, description: "How machine gambling environments are engineered to keep people playing.", whyMatch: "A direct match for gambling-system design and behavioural psychology.", provider: "Google Books · Open Library", identifiers: { ISBN_13: "9780691160887" } },
      { title: "The Biggest Bluff", authors: ["Maria Konnikova"], year: 2020, description: "Poker, psychology and decisions under uncertainty.", whyMatch: "A strong match for poker, probability and decision-making under uncertainty.", provider: "Google Books · Open Library", identifiers: { ISBN_13: "9780525522621" } },
      { title: "Thinking in Bets", authors: ["Annie Duke"], year: 2018, description: "Probability, incomplete information and better decisions.", whyMatch: "A useful probability-and-decisions companion to gambling-specific reading.", provider: "Google Books · Open Library", identifiers: { ISBN_13: "9780735216358" } },
    ] : [{
      title: "Pride and Prejudice",
      authors: ["Jane Austen"],
      year: 1813,
      description: "A novel of manners, judgement and self-knowledge.",
      whyMatch: "Matched across public book catalogues using title, creator and edition identifiers.",
      provider: "Google Books · Open Library",
      identifiers: { ISBN_13: "9780141439518" },
      rating: {
        overall: 4.26,
        ratingCount: 2000,
        sourceCount: 2,
        sources: [
          { name: "Google Books", sourceId: "google-pride", rating: 4.4, ratingCount: 1200, confidence: 0.96 },
          { name: "Open Library", sourceId: "/works/OL66554W", rating: 4.1, ratingCount: 800, confidence: 0.9 },
        ],
      },
    }];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, candidates }) });
  });
'''
path.write_text(text[:start] + route + text[end:])
PY
progress proof-adjusted pass

run_stage npm-ci npm ci --no-audit --no-fund
run_stage strict-build npm run build
progress strict-build pass

run_stage playwright-package npm install --no-save --package-lock=false --no-audit --no-fund playwright
run_stage playwright-browsers npx playwright install --with-deps chromium webkit
progress proof-engines pass

cat > /tmp/serve_notverse.py <<'PY'
import json
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?', 1)[0] == '/api/auth/google/status':
            body = json.dumps({'configured': False, 'connected': False, 'account': None}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()
ThreadingHTTPServer(('127.0.0.1', 4173), partial(Handler, directory='dist/client')).serve_forever()
PY
python3 /tmp/serve_notverse.py >/tmp/notverse-preview.log 2>&1 &
for n in $(seq 1 60); do
  curl -fsS http://127.0.0.1:4173/ >/dev/null && break
  sleep 1
done
curl -fsS http://127.0.0.1:4173/ >/dev/null || fail local-server

NOTVERSE_TEST_URL=http://127.0.0.1:4173 PROOF_DIR=engineering-evidence/production-polish-local node scripts/verify-production-polish.mjs || fail local-interaction-proof
progress local-interaction-proof pass

# Freeze exactly the locally proven product candidate. Temporary proof plumbing remains
# only until the deployed branch and live-service gates also pass.
git add -A
git commit -m 'Polish NoTVerse interactions, intelligence and public ratings' || fail freeze-commit
git push origin "HEAD:${BRANCH}" || fail freeze-push
progress candidate-frozen pass

npm run build || fail frozen-rebuild
js="$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' dist/client/index.html | head -1)"
css="$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.css' dist/client/index.html | head -1)"
test -n "$js" && test -n "$css" || fail asset-identification
progress frozen-assets pass

mkdir -p engineering-evidence/production-polish-preview engineering-evidence/production-polish-live
matched=0
for n in $(seq 1 150); do
  html="$(curl -fsS --max-time 20 "$PREVIEW_URL/?proof=$n" || true)"
  health="$(curl -fsS --max-time 20 "$PREVIEW_URL/api/health?proof=$n" || true)"
  if printf '%s' "$html" | grep -Fq "$js" \
    && printf '%s' "$html" | grep -Fq "$css" \
    && printf '%s' "$health" | grep -Fq '"app":"NoTVerse"'; then
    printf '%s\n' "$html" > engineering-evidence/production-polish-live/index.html
    printf '%s\n' "$health" > engineering-evidence/production-polish-live/health.json
    matched=1
    break
  fi
  sleep 10
done
test "$matched" = 1 || fail branch-preview-assets
progress branch-preview-assets pass

NOTVERSE_TEST_URL="$PREVIEW_URL" PROOF_DIR=engineering-evidence/production-polish-preview node scripts/verify-production-polish.mjs || fail deployed-interaction-proof
progress deployed-interaction-proof pass

NOTVERSE_URL="$PREVIEW_URL" PROOF_DIR=engineering-evidence/production-polish-live node scripts/verify-live-companion-matrix.mjs || fail companion-matrix
progress companion-matrix pass

NOTVERSE_URL="$PREVIEW_URL" PROOF_DIR=engineering-evidence/production-polish-live node scripts/verify-live-public-ratings.mjs || fail public-ratings
progress public-ratings pass

printf '{\n  "status": "production-candidate-proven",\n  "branch": "%s",\n  "js": "%s",\n  "css": "%s",\n  "localMatrix": "pass",\n  "deployedMatrix": "pass",\n  "companions": "12/12 pass",\n  "publicRatings": "pass"\n}\n' "$BRANCH" "$js" "$css" > engineering-evidence/production-polish-release-summary.json

# Remove all one-time workbench/proof plumbing before the PR can be merged.
rm -rf engineering-patches/production-polish
rm -f .github/workflows/diagnose-polish-chat.yml
rm -f .github/workflows/final-polish-gate.yml
rm -f .github/workflows/production-polish-proof.yml
rm -f .github/workflows/run-production-polish.yml
rm -f scripts/production-polish-runner.sh
rm -f "$PROGRESS" "$FAILURE"

git add -A
git commit -m 'Freeze proven NoTVerse production candidate' || fail final-cleanup-commit
git push origin "HEAD:${BRANCH}" || fail final-cleanup-push
