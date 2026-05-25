#!/usr/bin/env python3
"""PreToolUse guard: block edits/reads of secret env files.

Reads the tool-call payload from stdin and exits 2 (blocking the tool) when the
target is a real secret env file. Shareable templates (.env.example, etc.) are
allowed so onboarding still works.
"""
import json
import os
import sys

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

file_path = (data.get("tool_input") or {}).get("file_path", "") or ""
base = os.path.basename(file_path)

SHAREABLE = {".env.example", ".env.sample", ".env.template"}
is_secret = base == ".env" or (base.startswith(".env.") and base not in SHAREABLE)

if is_secret:
    sys.stderr.write(
        f"Blocked: {file_path} looks like a secret env file. "
        "Edit .env.example instead, or remove this guard in .claude/settings.json.\n"
    )
    sys.exit(2)

sys.exit(0)
