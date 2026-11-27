#!/bin/sh
# Re-copy the Faire extension's pure Model Studio rules (read-only source) into lib/model-shots-core/.
# Never edit the copies by hand: the web Model Studio and the extension must plan runs the same way.
set -eu
SRC="${FAIRE_REPO:-$HOME/Services/davidani-faire-management}/thumbnail-optimizer"
DST="$(cd "$(dirname "$0")/.." && pwd)/lib/model-shots-core"
REV=$(git -C "$SRC/.." log -1 --format=%h -- thumbnail-optimizer/model_shots_core.js)
{ printf '// Copied from davidani-faire-management thumbnail-optimizer/model_shots_core.js (%s).\n' "$REV"
  printf '// Do not edit by hand: scripts/sync-model-shots-core.sh re-copies it so the web Model Studio and the\n'
  printf '// Faire extension plan runs with the same rules (setup key, framing, borrow, file names).\n'
  cat "$SRC/model_shots_core.js"; } > "$DST/core.cjs"
python3 - "$SRC/test_model_shots_core.js" "$DST/core.test.ts" "$REV" <<'PY'
import sys
src, dst, rev = sys.argv[1:]
s = open(src).read()
s = s.replace('const test = require("node:test");', 'import { test } from "vitest";')
s = s.replace('const assert = require("node:assert/strict");', 'import assert from "node:assert/strict";')
s = s.replace('const core = require("./model_shots_core.js");', 'import { createRequire } from "node:module";\nconst core = createRequire(import.meta.url)("./core.cjs");')
a = s.find('test("the panel sends the known facts it was opened with"')
if a >= 0:
    b = s.index('});\n', a) + 4
    s = s[:a] + '// "the panel sends the known facts" checks the extension panel files, so it stays in the extension repo.\n' + s[b:]
s = s.replace("  const core=require('./model_shots_core');\n", "")
open(dst, "w").write(f"// @ts-nocheck -- verbatim JS test body; its types live in index.ts.\n// Copied from davidani-faire-management thumbnail-optimizer/test_model_shots_core.js ({rev}) by\n// scripts/sync-model-shots-core.sh. Do not edit by hand: change the extension copy, then re-sync.\n" + s)
PY
echo "synced model_shots_core.js @ $REV"
