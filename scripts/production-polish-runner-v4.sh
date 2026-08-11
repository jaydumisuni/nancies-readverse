#!/usr/bin/env bash
set -euo pipefail

# Once the exact candidate has passed the local Chromium/WebKit matrix and has
# been frozen on this draft branch, do not re-apply the product patch. Continue
# with the exact deployed bundle, all twelve live companions and public ratings.
if [[ -f engineering-evidence/production-polish-assets.json && -f src/notverse/production-polish.css ]]; then
  bash scripts/verify-frozen-production-candidate.sh
  exit $?
fi

python3 - <<'PY'
from pathlib import Path
source = Path('scripts/production-polish-runner-v2.sh').read_text()
needle = 'python3 scripts/prepare-production-polish.py || fail proof-preparation\n'
replacement = (
    'python3 scripts/apply-mobile-chat-runtime-fix.py || fail mobile-chat-runtime-fix\n'
    + needle
)
if needle not in source:
    raise SystemExit('Expected proof preparation call was not found in v2 runner')
Path('/tmp/notverse-production-polish-runner-v4.sh').write_text(source.replace(needle, replacement, 1))
PY
bash /tmp/notverse-production-polish-runner-v4.sh
