# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run commands from the repository root.

- Install dependencies: `npm install`
- Start local services: `docker compose up -d`
- Generate Prisma client: `npm run db:generate`
- Run database migrations: `npm run db:migrate`
- Open Prisma Studio: `npm run db:studio`
- Start the Next.js web app: `npm run dev:web`
- Start the BullMQ worker: `npm run dev:worker`
- Run production build: `npm run build`
- Run TypeScript checks: `npm run typecheck`
- Run all tests: `npm test`
- Run a single test file: `npm test -- packages/graph/src/resources.test.ts`
- Run tests by name: `npm test -- -t "Graph resources"`

There is no dedicated lint script configured; use `npm run typecheck`, `npm test`, and `npm run build` as the current verification set.

Local development expects `.env` values matching `.env.example`. Postgres and Redis are provided by `docker-compose.yml`; `DATABASE_URL` and `REDIS_URL` default to those local services. Microsoft Graph integration also needs `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `GRAPH_CLIENT_STATE`, and a public `GRAPH_WEBHOOK_URL` for real webhook testing.

The meeting assistant needs local audio tooling on macOS: `ffmpeg` and `whisper-cli` (whisper.cpp), a Whisper model (default `~/.cache/teams-discovery-observer/models/ggml-tiny.en.bin`), and a loopback device (BlackHole + a Multi-Output Device) to caption system audio. Capture tuning uses `MEETING_CAPTURE_*` env vars (see `.env.example` and `docs/features/meeting-assistant.md`).

## Architecture

This is an npm workspace TypeScript monorepo with two cooperating, local-first pillars:

1. **Teams discovery & quoting** — ingests *explicitly approved* Microsoft Teams messages via Microsoft Graph, stores normalized evidence, summarizes threads, extracts requirement cards, and answers questions over the collected context.
2. **Provider-agnostic live meeting assistant** — captures local macOS audio (mic + system/loopback), transcribes it locally with Whisper, shows a live transcript, and surfaces deterministic "assist now" cards. Works with any meeting provider because it captures local audio, not provider APIs.

### Documentation

Read these before non-trivial work; keep them in sync when behavior changes:

- `README.md` — overview, setup, architecture diagram.
- `docs/architecture.md` — module map, data model, runtime topology, job queues.
- `docs/features/meeting-assistant.md` — capture pipeline (VAD chunking, interim transcripts), assist cards, API.
- `docs/features/teams-ingestion.md` — Graph subscription → webhook → worker → summary → requirements.
- `docs/features/ai-and-providers.md` — provider contract and selection.

## Operating Principles

1. **Think before coding**: do not silently choose an interpretation when the request is ambiguous. State assumptions, surface tradeoffs, and ask before changing identifiers, signing, CI/CD, generated workflows, or broad formatting.
2. **Simplicity first**: write the minimum code that solves the current request. Reuse existing repo patterns, widgets, helpers, and skills before adding new abstractions.
3. **Surgical changes**: every changed line should trace to the request or required generated output. Do not refactor adjacent code, reformat unrelated files, or delete unrelated dead code unless asked.
4. **Goal-driven execution**: for multi-step work, define success criteria before coding, then verify with concrete checks such as `rg`, generation commands, analyzer, tests, or UI smoke tests.
5. **Use the model only for judgment calls**: use the model for classification, drafting, summarization, and extraction. Do not use it for routing, retries, or deterministic transforms. If code can answer, code answers.
6. **Surface conflicts, don't average them**: if two patterns contradict, pick one based on which is more recent or more tested. Explain why and flag the other for cleanup. Do not blend conflicting patterns.
7. **Read before you write**: before adding code, read exports, immediate callers, and shared utilities. "Looks orthogonal" is dangerous. If unsure why code is structured a way, ask.
8. **Tests verify intent, not just behavior**: tests must encode why behavior matters, not only what it does. A test that cannot fail when business logic changes is wrong.
9. **Checkpoint after every significant step**: summarize what was done, what is verified, and what is left. Do not continue from a state you cannot describe back. If you lose track, stop and restate.
10. **Match the codebase's conventions, even if you disagree**: conformance is more important than taste inside the codebase. If you genuinely think a convention is harmful, surface it instead of forking silently.
11. **Fail loud**: "Completed" is wrong if anything was skipped silently. "Tests pass" is wrong if any were skipped. Default to surfacing uncertainty, not hiding it.

### Workspaces

- `apps/web` — Next.js App Router dashboard and API routes. Also hosts server-managed meeting capture in `src/lib/capture/` (spawns ffmpeg + whisper-cli).
- `apps/worker` — BullMQ worker process for Graph notification processing, AI summarization, requirement extraction, and subscription renewal.
- `apps/meeting-capture` — standalone CLI capture companion (`tsx`) for headless/manual audio capture; uses fixed-interval chunking (not the server's VAD/interim pipeline).
- `packages/core` — shared domain schemas/types (incl. the `meetings` domain and `detectMeetingAssistInsights` heuristics), queue names, monitoring policy checks, HTML sanitization, and security helpers.
- `packages/graph` — Microsoft Graph client, Teams resource/subscription helpers, and Graph chat message normalization.
- `packages/ai` — provider interface plus local OpenAI-compatible and local Claude Code CLI providers, prompt templates, and JSON parsing.
- `packages/db` — Prisma client singleton and Prisma exports.
- `prisma/schema.prisma` — canonical data model for tenants, monitored Teams sources, Graph subscriptions, messages, summaries, requirements, agent sessions, audit logs, and meeting sessions/utterances/insights/summaries.

### Ingestion flow

1. A source is approved from `apps/web/src/app/(dashboard)/sources/page.tsx`, which creates a `MonitoredSource` with `APPROVED` status.
2. `apps/web/src/app/api/graph/subscriptions/route.ts` creates a Microsoft Graph change-notification subscription for that approved source using `packages/graph/src/subscriptions.ts`.
3. Microsoft Graph calls `apps/web/src/app/api/graph/webhook/route.ts`. The route handles validation challenges, validates `clientState`, and enqueues a `graph-notifications` job.
4. `apps/worker/src/jobs/process-graph-notification.ts` re-validates `clientState`, finds the registered subscription, checks `assertSourceCanIngest`, fetches the message from Graph, normalizes/sanitizes it, upserts `Message`, and enqueues summarization.
5. `apps/worker/src/jobs/summarize-thread.ts` builds an evidence bundle for the thread, calls the selected AI provider, stores a `ThreadSummary`, extracts requirement cards, and stores `Requirement` rows.
6. `apps/worker/src/jobs/renew-graph-subscriptions.ts` renews active subscriptions near expiry when Graph credentials are configured.

The policy boundary is explicit source approval: ingestion must go through `assertSourceCanIngest` and should not monitor tenant-wide Teams data implicitly.

### AI flow

`packages/ai/src/provider.ts` defines the provider contract: `summarizeThread`, `extractRequirements`, `answerQuestion`, and `summarizeMeeting` (rolling meeting notes). `createAiProvider` in `packages/ai/src/factory.ts` selects either:

- `LOCAL_OPENAI` — calls a local OpenAI-compatible `/chat/completions` endpoint such as Ollama or LM Studio.
- `CLAUDE_CODE_CLI` — spawns the local Claude Code CLI with `claude -p` and a bounded prompt.

Prompt templates in `packages/ai/src/prompts/` treat Teams messages as untrusted evidence and require message-ID citations. The ask-agent API at `apps/web/src/app/api/agent/ask/route.ts` retrieves recent messages, summaries, and non-rejected requirements, calls the selected provider, and stores an `AgentSession`.

### Meeting assistant flow

1. A `MeetingSession` is created from `/meetings` (or `POST /api/meetings`); the user opens `/meetings/[meetingId]` and clicks **Start listening** (no auto-start).
2. `apps/web/src/lib/capture/manager.ts` spawns ffmpeg per source (mic and/or loopback), recording short 1.5s frames via the segment muxer.
3. Each frame is classified speech/silence by peak volume (the silence gate doubles as a VAD). Consecutive speech frames are buffered; the buffer is re-transcribed every couple of frames as **interim** text (updating the same `TranscriptUtterance` row, flagged `engineMetadata.interim`), and **finalized** on a pause or ~24s cap.
4. On finalize, `apps/web/src/lib/meeting-insights.ts` runs `detectMeetingAssistInsights` once and writes `MeetingInsight` rows. The assist **cards** are **deterministic — no model call**. Two separate, off-the-card-path features do use models: opt-in speaker diarization of the "others" channel (`MEETING_CAPTURE_DIARIZATION`, a local voice-embedding model per finalized utterance → `Speaker N`), and opt-in throttled rolling **meeting notes** (`MEETING_NOTES`; `apps/web/src/lib/meeting-notes.ts` calls the configured LLM provider's `summarizeMeeting` to upsert a `MeetingSummary`). See `docs/features/meeting-assistant.md`.
5. `LiveMeetingWorkspace` polls `GET /api/meetings/[id]` and `/capture` every 1.5s. Capture stops on **Stop listening**, session end, or page close (`pagehide`).

Transcription is local (`whisper-cli`); raw audio chunks are deleted right after transcription. Full detail: `docs/features/meeting-assistant.md`.

### Web app

The dashboard pages live under `apps/web/src/app/(dashboard)/`:

- `/` — summary dashboard
- `/sources` — approve Teams channels/chats and create Graph subscriptions
- `/threads` — browse recent messages and summaries
- `/requirements` — confirm/reject extracted requirement cards
- `/agent` — ask questions over stored evidence
- `/export` — preview/download quoting evidence as JSON
- `/meetings` and `/meetings/[meetingId]` — start a live meeting session and run the listening workspace

Server APIs live under `apps/web/src/app/api/`. Queue producers use `apps/web/src/lib/queues.ts`; Graph setup uses `apps/web/src/lib/graph.ts`; local tenant creation is in `apps/web/src/lib/tenant.ts`. Meeting endpoints (`/api/meetings`, `/api/meetings/[id]`, `/api/meetings/[id]/utterances`, `/api/meetings/[id]/capture`, `/api/meetings/devices`) use the capture manager and `apps/web/src/lib/meeting-insights.ts`.

### Data model notes

`MonitoredSource` represents an explicitly approved Teams channel/chat. `GraphSubscription` links Graph subscription IDs back to sources. `Message` stores both sanitized text/html and raw Graph JSON. `ThreadSummary`, `Requirement`, and `AgentSession` all retain evidence message IDs so outputs can be traced back to Teams messages.

Meeting models are provider-agnostic: `MeetingSession` (status, platform label, optional source link) owns `TranscriptUtterance` (speakerRole `SELF`/`OTHER`/`UNKNOWN`, sourceChannel `MIC`/`LOOPBACK`/`MIXED`/`IMPORTED`, audio-relative `startedAt`/`endedAt` + `confidence`, `engineMetadata` carrying the interim flag and — when diarization is on — `speakerLabel`/`speakerKey`), `MeetingInsight` (assist-card kinds), and `MeetingSummary` (the rolling LLM notes: `summary`/`openQuestions`/`actionItems`, updated in place).

## Agent skills

### Issue tracker

No issue tracker is configured yet; issue-writing skills must ask before publishing work. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default canonical triage labels for future issue workflows. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: use root `CONTEXT.md` and root `docs/adr/` when they exist. See `docs/agents/domain.md`.
