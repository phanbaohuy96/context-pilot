---
name: dev-up
description: Bring the local stack up from a cold start — Postgres + Redis, Prisma client + migrations, then the Next.js web app and BullMQ worker. Use when setting up the project or recovering after services were stopped.
disable-model-invocation: true
---

# dev-up

Cold-start the local development stack. Steps map to the Makefile targets in this repo.

## Before starting

Check whether the web app is already running so you don't fight an existing session:

```bash
curl -fsS -o /dev/null http://localhost:3000/meetings && echo "web already running — skip dev-web" || echo "web not running"
```

## Steps

```bash
make install            # first time only
make services-up        # Postgres + Redis (docker compose up -d)
# ensure Docker Desktop is running first; otherwise `open -a Docker` and wait
make db-generate        # prisma generate
make db-migrate         # prisma migrate dev
```

Then start the long-running processes in separate terminals (do not background them blindly if one is already up):

```bash
make dev-web            # http://localhost:3000
make dev-worker         # BullMQ worker
```

## Verify

```bash
make verify             # typecheck + test + build
```

## Notes

- `.env` must exist (copy from `.env.example`). The block-secrets hook prevents editing it via tools — edit it by hand.
- For the meeting assistant, also confirm `ffmpeg`, `whisper-cli`, the Whisper model, and BlackHole are present (see `docs/features/meeting-assistant.md`).
