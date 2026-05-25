#!/usr/bin/env python3
"""Stop hook: run the repo type-check once when the turn ends.

If `tsc --noEmit` fails, exit 2 so the errors are surfaced to the agent. The
`stop_hook_active` guard prevents an infinite block/continue loop — we only
block once per turn chain.
"""
import json
import subprocess
import sys

try:
    data = json.load(sys.stdin)
except Exception:
    data = {}

if data.get("stop_hook_active"):
    sys.exit(0)

proc = subprocess.run(["npm", "run", "typecheck"], capture_output=True, text=True)
if proc.returncode == 0:
    sys.exit(0)

sys.stderr.write("Type check failed (npm run typecheck):\n")
sys.stderr.write((proc.stdout or "") + (proc.stderr or ""))
sys.exit(2)
