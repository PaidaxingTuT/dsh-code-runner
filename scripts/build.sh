#!/bin/bash
# Build the host half with tsc. The client half is built by `npm run
# build:client` (tsdown), which dev_build_plugin / prepack invoke separately.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TSC="${TSC:-}"
if [ -z "$TSC" ]; then
  if [ -x node_modules/.bin/tsc ]; then
    TSC="node_modules/.bin/tsc"
  elif [ -f node_modules/.bin/tsc.cmd ]; then
    TSC="node_modules/.bin/tsc.cmd"
  else
    # Fallback to a DSH checkout's TypeScript when the project has not been
    # `npm install`ed yet.
    CHECKOUT="${DSH_CHECKOUT:-}"
    if [ -z "$CHECKOUT" ]; then
      for candidate in "$HOME/dsh-harness" "$HOME/dsh" "$HOME/.dsh/dsh-harness"; do
        if [ -d "$candidate/packages" ]; then CHECKOUT="$candidate"; break; fi
      done
    fi
    if [ -n "$CHECKOUT" ] && [ -x "$CHECKOUT/node_modules/.bin/tsc" ]; then
      TSC="$CHECKOUT/node_modules/.bin/tsc"
    elif [ -n "$CHECKOUT" ] && [ -f "$CHECKOUT/node_modules/.bin/tsc.cmd" ]; then
      TSC="$CHECKOUT/node_modules/.bin/tsc.cmd"
    fi
  fi
fi

if [ -z "$TSC" ] || [ ! -f "$TSC" ]; then
  echo "build: cannot locate tsc (run npm install or set DSH_CHECKOUT)" >&2
  exit 1
fi

"$TSC" -p tsconfig.json
echo "=== host build complete (lib/) ==="
