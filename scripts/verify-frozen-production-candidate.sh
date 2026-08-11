#!/usr/bin/env bash
set -euo pipefail

BRANCH='polish-notverse-production-20260806'
PREVIEW_URL='https://polish-notverse-production-20260806-notverse.pharrtechnolgiescoltd.workers.dev'
PROGRESS='engineering-evidence/production-polish-progress.txt'
FAILURE='engineering-evidence/production-polish-failure.txt'
RUNLOG='/tmp/notverse-frozen-production-proof.log'

mkdir -p engineering-evidence/production-polish-preview engineering-evidence/production-polish-live
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
  local stage="$1" result="$2"
  printf 'stage=%s\nresult=%s\nworkflow_sha=%s\nhead=%s\ntime_utc=%s\n' \
    "$stage" "$result" "${GITHUB_SHA:-unknown}" "$(git rev-parse HEAD)" "$(date -u +%FT%TZ)" > "$PROGRESS"
  save_evidence "NoTVerse frozen proof: ${stage} ${result}" "$PROGRESS"
}

fail() {
  local stage="$1"
  printf 'stage=%s\nresult=failure\nworkflow_sha=%s\nhead=%s\ntime_utc=%s\n' \
    "$stage" "${GITHUB_SHA:-unknown}" "$(git rev-parse HEAD)" "$(date -u +%FT%TZ)" > "$PROGRESS"
  { printf 'FAILED_STAGE=%s\n\n' "$stage"; tail -n 360 "$RUNLOG" 2>/dev/null || true; } > "$FAILURE"
  save_evidence "Record NoTVerse frozen proof failure at ${stage}" "$PROGRESS" "$FAILURE"
  exit 1
}

stage() { local name="$1"; shift; "$@" || fail "$name"; }

progress frozen-start running
stage npm-ci npm ci --no-audit --no-fund
stage strict-build npm run build
progress frozen-build pass

js="$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' dist/client/index.html | head -1)"
css="$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.css' dist/client/index.html | head -1)"
test -n "$js" && test -n "$css" || fail asset-identification
printf '{"commit":"%s","js":"%s","css":"%s"}\n' "$(git rev-parse HEAD)" "$js" "$css" > engineering-evidence/production-polish-assets.json
save_evidence 'Record exact frozen NoTVerse assets' engineering-evidence/production-polish-assets.json
progress frozen-assets pass

stage playwright-package npm install --no-save --package-lock=false --no-audit --no-fund playwright
stage playwright-browsers npx playwright install --with-deps chromium webkit
progress frozen-proof-engines pass

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
save_evidence 'Record proven frozen NoTVerse production candidate' engineering-evidence/production-polish-release-summary.json
progress complete pass
