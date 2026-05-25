---
name: capture-smoke
description: End-to-end smoke test of the live meeting assistant — routes macOS system audio into BlackHole, plays a clip from a local video, confirms live transcription + assist cards via the API, then restores the original audio output device. Use to verify the capture pipeline after changes to apps/web/src/lib/capture or the meeting API.
disable-model-invocation: true
---

# capture-smoke

Verifies the server-managed meeting capture pipeline end to end without manual clicking.

## What it does

1. Resolves the **BlackHole** capture input index from `ffmpeg` avfoundation devices.
2. Extracts a short clip from a local video (`tmp/test-meeting.mp4` by default).
3. Creates a meeting session and starts capture on the BlackHole input via the API.
4. **Temporarily switches system output to "BlackHole 2ch"**, plays the clip into it, then **restores your previous output device** (always, via an exit trap).
5. Prints the captured transcript so you can confirm utterances + assist behavior.

## Prerequisites

- The web app running locally (`make dev-web`).
- `ffmpeg`, `afplay` (macOS), and `SwitchAudioSource` (`brew install switchaudio-osx`).
- BlackHole installed as an audio device.
- A local video at `tmp/test-meeting.mp4` (or pass `CLIP=...`).

## ⚠️ Important

While the clip plays, your system output is routed to BlackHole, so **you will not hear it** — the script restores your real output device when it finishes or is interrupted. Don't run this in the middle of a real meeting.

## Run

```bash
bash .claude/skills/capture-smoke/verify.sh
# options (env vars):
#   BASE_URL=http://localhost:3000  CLIP=tmp/test-meeting.mp4  SS=120  DUR=24  TITLE="..."
```

A healthy run prints several `Participant` utterances and restores the output device.
