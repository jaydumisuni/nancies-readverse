#!/usr/bin/env bash
set -uo pipefail

BRANCH='polish-notverse-production-20260806'
PREVIEW_URL='https://polish-notverse-production-20260806-notverse.pharrtechnolgiescoltd.workers.dev'
PROGRESS='engineering-evidence/production-polish-progress.txt'
FAILURE='engineering-evidence/production-polish-failure.txt'
RUNLOG='/tmp/notverse-production-polish-v2.log'

mkdir -p engineering-evidence
exec > >(tee "$RUNLOG") 2>&1

git config user.name 'NoTVerse Verification'
git config user.email 'actions@users.noreply.github.com'

save_evidence() {
  local message="$1"
  shift
  git add -- "$@"
  git commit -m "$message [skip ci]" -- "$@" >/dev/null 2>&1 || true
  git push origin "HEAD:${BRANCH}" >/dev/null 2>&1 || true
}

progress() {
  local stage="$1"
  local result="$2"
  printf 'stage=%s\nresult=%s\nworkflow_sha=%s\nhead=%s\ntime_utc=%s\n' \
    "$stage" "$result" "${GITHUB_SHA:-unknown}" "$(git rev-parse HEAD)" "$(date -u +%FT%TZ)" > "$PROGRESS"
  save_evidence "NoTVerse polish progress: ${stage} ${result}" "$PROGRESS"
}

fail() {
  local stage="$1"
  printf 'stage=%s\nresult=failure\nworkflow_sha=%s\nhead=%s\ntime_utc=%s\n' \
    "$stage" "${GITHUB_SHA:-unknown}" "$(git rev-parse HEAD)" "$(date -u +%FT%TZ)" > "$PROGRESS"
  {
    printf 'FAILED_STAGE=%s\n\n' "$stage"
    tail -n 320 "$RUNLOG" 2>/dev/null || true
  } > "$FAILURE"
  save_evidence "Record NoTVerse polish failure at ${stage}" "$PROGRESS" "$FAILURE"
  exit 1
}

stage() {
  local name="$1"
  shift
  "$@" || fail "$name"
}

progress start running

cat engineering-patches/production-polish/part-*.b64 | base64 --decode > /tmp/notverse-product.patch.gz || fail decode
printf '%s  %s\n' '6c19abd69c0d89831d4a4ccaffe1805f547794265179cf9f01908e366a4d1db2' /tmp/notverse-product.patch.gz | sha256sum --check || fail checksum
gzip -dc /tmp/notverse-product.patch.gz > /tmp/notverse-product.patch || fail decompress
git apply --check /tmp/notverse-product.patch || fail product-patch-check
git apply /tmp/notverse-product.patch || fail product-patch-apply
git apply --check engineering-patches/production-polish/short-phone-home.patch || fail short-phone-patch-check
git apply engineering-patches/production-polish/short-phone-home.patch || fail short-phone-patch-apply
git apply --check engineering-patches/production-polish/mobile-home-viewport.patch || fail mobile-home-patch-check
git apply engineering-patches/production-polish/mobile-home-viewport.patch || fail mobile-home-patch-apply
python3 scripts/prepare-production-polish.py || fail proof-preparation
progress candidate-applied pass

stage npm-ci npm ci --no-audit --no-fund
stage strict-build npm run build
progress strict-build pass

stage playwright-package npm install --no-save --package-lock=false --no-audit --no-fund playwright
stage playwright-browsers npx playwright install --with-deps chromium webkit
progress proof-engines pass

cat > /tmp/serve_notverse.py <<'PY'
import json
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?', 1)[0] == '/api/auth/google/status':
            payload = json.dumps({'configured': False, 'connected': False, 'account': None}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        return super().do_GET()

ThreadingHTTPServer(('127.0.0.1', 4173), partial(Handler, directory='dist/client')).serve_forever()
PY
python3 /tmp/serve_notverse.py >/tmp/notverse-preview.log 2>&1 &
for n in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:4173/ >/dev/null; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:4173/ >/dev/null || fail local-server

NOTVERSE_TEST_URL=http://127.0.0.1:4173 PROOF_DIR=engineering-evidence/production-polish-local node scripts/verify-production-polish.mjs || fail local-interaction-proof
progress local-interaction-proof pass

# Freeze the exact locally-proven candidate on the draft branch so Cloudflare can
# deploy that same source to a branch preview. Proof/workbench files are removed
# only after live proof is complete and manually inspected.
git add -A
git commit -m 'Polish NoTVerse interactions, intelligence and public ratings [skip ci]' || fail freeze-commit
git push origin "HEAD:${BRANCH}" || fail freeze-push
progress candidate-frozen pass

npm run build || fail frozen-rebuild
js="$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' dist/client/index.html | head -1)"
css="$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.css' dist/client/index.html | head -1)"
test -n "$js" && test -n "$css" || fail asset-identification
printf '{"commit":"%s","js":"%s","css":"%s"}\n' "$(git rev-parse HEAD)" "$js" "$css" > engineering-evidence/production-polish-assets.json
save_evidence 'Record exact NoTVerse candidate assets' engineering-evidence/production-polish-assets.json
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

printf '{\n  "status": "production-candidate-proven",\n  "branch": "%s",\n  "commit": "%s",\n  "js": "%s",\n  "css": "%s",\n  "localMatrix": "pass",\n  "deployedMatrix": "pass",\n  "companions": "12/12 pass",\n  "publicRatings": "pass"\n}\n' \
  "$BRANCH" "$(git rev-parse HEAD)" "$js" "$css" > engineering-evidence/production-polish-release-summary.json
save_evidence 'Record proven NoTVerse production candidate' engineering-evidence/production-polish-release-summary.json
progress complete pass
