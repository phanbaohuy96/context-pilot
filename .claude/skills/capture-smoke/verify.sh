#!/usr/bin/env bash
# Smoke-test the live meeting capture pipeline. See SKILL.md.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
CLIP="${CLIP:-tmp/test-meeting.mp4}"
SS="${SS:-120}"
DUR="${DUR:-24}"
TITLE="${TITLE:-Capture smoke test}"

command -v ffmpeg >/dev/null || { echo "ffmpeg not found"; exit 1; }
command -v afplay >/dev/null || { echo "afplay not found (macOS only)"; exit 1; }
command -v SwitchAudioSource >/dev/null || { echo "SwitchAudioSource not found: brew install switchaudio-osx"; exit 1; }
[ -f "$CLIP" ] || { echo "clip not found: $CLIP (set CLIP=...)"; exit 1; }
curl -fsS -o /dev/null "$BASE_URL/meetings" || { echo "web app not reachable at $BASE_URL (run: make dev-web)"; exit 1; }

# Resolve the BlackHole capture input index from avfoundation audio devices.
BH_INDEX=$(ffmpeg -f avfoundation -list_devices true -i "" 2>&1 | python3 -c '
import sys, re
audio = False
for line in sys.stdin:
    if "AVFoundation audio devices" in line:
        audio = True; continue
    if "AVFoundation video devices" in line:
        audio = False
    if audio:
        m = re.search(r"\[(\d+)\]\s+(.+)", line)
        if m and "blackhole" in m.group(2).lower():
            print(m.group(1)); break
')
[ -n "${BH_INDEX:-}" ] || { echo "BlackHole not found as an audio input device"; exit 1; }
echo "BlackHole capture input = :$BH_INDEX"

CLIP_WAV="$(mktemp -t capture-smoke).wav"
ffmpeg -hide_banner -loglevel error -y -ss "$SS" -i "$CLIP" -t "$DUR" -ac 2 -ar 44100 "$CLIP_WAV"

MID=$(curl -fsS -X POST "$BASE_URL/api/meetings" -H 'Content-Type: application/json' \
  -d "{\"title\":\"$TITLE\",\"platform\":\"BROWSER\"}" \
  | python3 -c 'import sys, json; print(json.load(sys.stdin)["meeting"]["id"])')
echo "meeting=$MID  ->  $BASE_URL/meetings/$MID"

PREV_OUT=$(SwitchAudioSource -t output -c)
cleanup() {
  SwitchAudioSource -t output -s "$PREV_OUT" >/dev/null 2>&1 || true
  curl -fsS -X DELETE "$BASE_URL/api/meetings/$MID/capture" >/dev/null 2>&1 || true
  rm -f "$CLIP_WAV"
  echo "restored output to: $PREV_OUT; capture stopped"
}
trap cleanup EXIT

curl -fsS -X POST "$BASE_URL/api/meetings/$MID/capture" -H 'Content-Type: application/json' \
  -d "{\"meeting\":\":$BH_INDEX\"}" >/dev/null

echo "routing output to BlackHole 2ch and playing clip (you will not hear it during the test)..."
SwitchAudioSource -t output -s "BlackHole 2ch" >/dev/null
afplay "$CLIP_WAV"
sleep 7

echo "== captured transcript =="
curl -fsS "$BASE_URL/api/meetings/$MID" \
  | python3 -c 'import sys, json; u=json.load(sys.stdin)["meeting"]["utterances"]; print("lines:", len(u)); [print(" -", repr(x["text"])) for x in u]'
