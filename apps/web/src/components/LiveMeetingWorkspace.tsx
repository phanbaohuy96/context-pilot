"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type MeetingStatus = "ACTIVE" | "ENDED" | "ERROR";
type SpeakerRole = "SELF" | "OTHER" | "UNKNOWN";
type SourceChannel = "MIC" | "LOOPBACK" | "MIXED" | "IMPORTED";

type Utterance = {
  id: string;
  speakerRole: SpeakerRole;
  sourceChannel: SourceChannel;
  startedAt: string;
  text: string;
  interim?: boolean;
  speakerKey?: number;
  speakerLabel?: string;
  speakerAlias?: string;
};

type RawUtterance = Omit<Utterance, "interim" | "speakerKey" | "speakerLabel" | "speakerAlias"> & {
  engineMetadata?: { interim?: boolean; speakerKey?: number; speakerLabel?: string; speakerAlias?: string } | null;
};

type Insight = {
  id: string;
  kind: string;
  text: string;
  keywords: string[];
  relatedUtteranceIds: string[];
  createdAt: string;
};

// A question and its suggested answer are two insights emitted from the same
// utterance; the rail pairs them into one card so they read as one thought.
type AssistItem = {
  key: string;
  ids: string[];
  kind: "QUESTION" | "ACTION" | "MENTION" | "NOTE";
  createdAt: string;
  question?: string;
  reply?: string;
  body?: string;
  keywords: string[];
};

type Summary = {
  id: string;
  summary: string;
  openQuestions: string[];
  actionItems: string[];
  model: string;
  createdAt: string;
};

type MeetingPayload = {
  id: string;
  status: MeetingStatus;
  utterances: RawUtterance[];
  insights: Insight[];
  summaries: Summary[];
};

function toUtterance(raw: RawUtterance): Utterance {
  return {
    id: raw.id,
    speakerRole: raw.speakerRole,
    sourceChannel: raw.sourceChannel,
    startedAt: raw.startedAt,
    text: raw.text,
    interim: raw.engineMetadata?.interim === true,
    speakerKey: raw.engineMetadata?.speakerKey,
    speakerLabel: raw.engineMetadata?.speakerLabel,
    speakerAlias: raw.engineMetadata?.speakerAlias,
  };
}

type AudioDevice = { index: string; name: string };

type CaptureSourceStatus = {
  source: "MIC" | "MEETING";
  label: string;
  input: string;
  running: boolean;
  utterances: number;
  lastText?: string;
  lastError?: string;
};

type CaptureStatus = {
  meetingId: string;
  running: boolean;
  startedAt: string;
  sources: CaptureSourceStatus[];
};

type LiveMeetingWorkspaceProps = {
  meetingId: string;
  status: MeetingStatus;
  platform: string;
  startedLabel: string;
  audioSource: string;
  linkedSource: string | null;
  importMediaFile: string | null;
  initialUtterances: Utterance[];
  initialInsights: Insight[];
  initialSummaries: Summary[];
};

export function LiveMeetingWorkspace({
  meetingId,
  status,
  platform,
  startedLabel,
  audioSource,
  linkedSource,
  importMediaFile,
  initialUtterances,
  initialInsights,
  initialSummaries,
}: LiveMeetingWorkspaceProps) {
  const [meetingStatus, setMeetingStatus] = useState(status);
  const [utterances, setUtterances] = useState(initialUtterances);
  const [insights, setInsights] = useState(initialInsights);
  const [summaries, setSummaries] = useState(initialSummaries);

  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [micInput, setMicInput] = useState("");
  const [meetingInput, setMeetingInput] = useState("");
  const [capture, setCapture] = useState<CaptureStatus | null>(null);
  const [captureError, setCaptureError] = useState("");
  const [capturePending, setCapturePending] = useState(false);
  const [speakerDrafts, setSpeakerDrafts] = useState<Record<number, string>>({});
  const [editingSpeaker, setEditingSpeaker] = useState<{ key: number; utteranceId: string } | null>(null);
  const [savingSpeakerKey, setSavingSpeakerKey] = useState<number | null>(null);
  const [speakerError, setSpeakerError] = useState("");
  const [diarizePending, setDiarizePending] = useState(false);
  const [diarizeError, setDiarizeError] = useState("");

  const capturingRef = useRef(false);
  const active = meetingStatus === "ACTIVE";
  const capturing = capture?.running ?? false;
  capturingRef.current = capturing;
  const hasLoopbackDevice = devices.some(isLoopbackDevice);
  const hasOthersSource = (capture?.sources ?? []).some((source) => source.source === "MEETING");
  const micOnlyWarning = capturing && !hasOthersSource;

  useEffect(() => {
    if (!active) {
      return;
    }

    const interval = window.setInterval(() => {
      void refresh();
    }, 1500);

    return () => window.clearInterval(interval);
  }, [active, meetingId]);

  useEffect(() => {
    if (!active) {
      return;
    }

    void loadCaptureConfig();
  }, [active, meetingId]);

  // Stop this page's capture when the tab closes, reloads, or navigates away so a
  // forgotten tab doesn't keep capturing (and double-capture from another session).
  // keepalive lets the DELETE complete during unload. Intentionally not on tab-switch
  // (hidden) — the dashboard usually sits beside the meeting app while capture runs.
  useEffect(() => {
    const stopOnExit = () => {
      if (!capturingRef.current) {
        return;
      }
      void fetch(`/api/meetings/${meetingId}/capture`, { method: "DELETE", keepalive: true });
    };

    window.addEventListener("pagehide", stopOnExit);
    return () => window.removeEventListener("pagehide", stopOnExit);
  }, [meetingId]);

  // Loads devices and sets sensible defaults, but does not start capture.
  // Capture only begins when the user clicks Start listening.
  async function loadCaptureConfig(): Promise<void> {
    const [deviceList] = await Promise.all([loadDevices(), loadCaptureStatus()]);
    const defaultMic = pickDefaultMic(deviceList);
    const defaultMeeting = pickDefaultMeeting(deviceList);
    if (defaultMic) {
      setMicInput((current) => current || defaultMic);
    }
    if (defaultMeeting) {
      setMeetingInput((current) => current || defaultMeeting);
    }
  }

  async function loadDevices(): Promise<AudioDevice[]> {
    const result = await fetch("/api/meetings/devices", { cache: "no-store" });
    if (!result.ok) {
      return [];
    }
    const body = await result.json() as { devices: AudioDevice[] };
    setDevices(body.devices);
    return body.devices;
  }

  async function loadCaptureStatus(): Promise<CaptureStatus | null> {
    const result = await fetch(`/api/meetings/${meetingId}/capture`, { cache: "no-store" });
    if (!result.ok) {
      return null;
    }
    const body = await result.json() as { capture: CaptureStatus | null };
    setCapture(body.capture);
    return body.capture;
  }

  async function startCapture(): Promise<void> {
    setCaptureError("");
    setCapturePending(true);
    try {
      const payload = {
        mic: micInput || undefined,
        meeting: meetingInput || undefined,
      };
      const result = await fetch(`/api/meetings/${meetingId}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await result.json().catch(() => ({}));
      if (!result.ok) {
        setCaptureError(body.error ?? "Could not start capture.");
        return;
      }
      setCapture(body.capture);
    } finally {
      setCapturePending(false);
    }
  }

  async function stopCapture(): Promise<void> {
    setCapturePending(true);
    try {
      await fetch(`/api/meetings/${meetingId}/capture`, { method: "DELETE" });
      setCapture(null);
    } finally {
      setCapturePending(false);
    }
  }

  async function refresh(): Promise<void> {
    const [meetingResult, captureResult] = await Promise.all([
      fetch(`/api/meetings/${meetingId}`, { cache: "no-store" }),
      fetch(`/api/meetings/${meetingId}/capture`, { cache: "no-store" }),
    ]);

    if (meetingResult.ok) {
      const body = await meetingResult.json() as { meeting: MeetingPayload };
      setMeetingStatus(body.meeting.status);
      setUtterances(body.meeting.utterances.map(toUtterance));
      setInsights(body.meeting.insights);
      setSummaries(body.meeting.summaries);
    }

    if (captureResult.ok) {
      const body = await captureResult.json() as { capture: CaptureStatus | null };
      setCapture(body.capture);
    }
  }

  const speakerAliases = useMemo(() => buildSpeakerAliases(utterances), [utterances]);
  const hasDiarizedSpeakers = utterances.some((utterance) => Boolean(speakerIdentityKey(utterance)));
  const hasImportedRemoteUtterances = utterances.some((utterance) => utterance.speakerRole === "OTHER" && utterance.sourceChannel === "IMPORTED");
  const canDiarize = Boolean(importMediaFile) && hasImportedRemoteUtterances && !hasDiarizedSpeakers;

  async function runDiarization(): Promise<void> {
    setDiarizeError("");
    if (!importMediaFile) {
      setDiarizeError("This meeting is not linked to an imported recording.");
      return;
    }
    setDiarizePending(true);
    try {
      const result = await fetch(`/api/meetings/${meetingId}/speakers/diarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaFile: importMediaFile }),
      });
      const body = await result.json().catch(() => ({}));
      if (!result.ok) {
        setDiarizeError(body.error ?? "Could not diarize speakers.");
        return;
      }
      await refresh();
    } catch (error) {
      setDiarizeError(error instanceof Error ? error.message : "Could not diarize speakers.");
    } finally {
      setDiarizePending(false);
    }
  }

  function beginRenameSpeaker(utterance: Utterance): void {
    const speakerKey = utterance.speakerKey;
    if (!speakerKey) {
      return;
    }
    setSpeakerError("");
    setEditingSpeaker({ key: speakerKey, utteranceId: utterance.id });
    setSpeakerDrafts((current) => ({
      ...current,
      [speakerKey]: speakerAliases[speakerKey] ?? "",
    }));
  }

  function cancelRenameSpeaker(speakerKey: number): void {
    setEditingSpeaker(null);
    setSpeakerDrafts((current) => {
      const next = { ...current };
      delete next[speakerKey];
      return next;
    });
  }

  async function renameSpeaker(speakerKey: number): Promise<void> {
    const alias = (speakerDrafts[speakerKey] ?? speakerAliases[speakerKey] ?? "").trim();
    setSpeakerError("");
    setSavingSpeakerKey(speakerKey);
    try {
      const result = await fetch(`/api/meetings/${meetingId}/speakers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speakerKey, alias }),
      });
      const body = await result.json().catch(() => ({}));
      if (!result.ok) {
        setSpeakerError(body.error ?? "Could not rename speaker.");
        return;
      }
      setUtterances((current) => current.map((utterance) => utterance.speakerKey === speakerKey
        ? { ...utterance, speakerAlias: alias || undefined }
        : utterance));
      setEditingSpeaker(null);
      setSpeakerDrafts((current) => {
        const next = { ...current };
        delete next[speakerKey];
        return next;
      });
    } catch (error) {
      setSpeakerError(error instanceof Error ? error.message : "Could not rename speaker.");
    } finally {
      setSavingSpeakerKey(null);
    }
  }

  const latestCaption = useMemo(() => utterances[utterances.length - 1], [utterances]);
  // Synthesized rolling notes come from the latest MeetingSummary (newest first).
  const latestNotes = summaries[0];
  const hasNotes = Boolean(
    latestNotes && (latestNotes.summary || latestNotes.actionItems.length || latestNotes.openQuestions.length),
  );

  // Pair each question with its suggested answer (both emitted from one utterance)
  // into a single card, newest first, with the engine's verbose prefixes stripped.
  const assistItems = useMemo(() => buildAssistItems(insights), [insights]);

  // "New since you last looked": ids present on first render are treated as seen, so
  // nothing flashes on open; cards arriving on later polls pulse briefly. The 1.5s
  // poll re-renders age the flag out on their own (no extra timer needed).
  const seenInsightIds = useRef<Set<string>>(new Set(initialInsights.map((insight) => insight.id)));
  const newInsightAt = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    for (const insight of insights) {
      if (!seenInsightIds.current.has(insight.id)) {
        seenInsightIds.current.add(insight.id);
        newInsightAt.current.set(insight.id, Date.now());
      }
    }
  }, [insights]);
  const isNewItem = (item: AssistItem): boolean =>
    item.ids.some((id) => {
      const at = newInsightAt.current.get(id);
      return at != null && Date.now() - at < NEW_INSIGHT_MS;
    });

  const transcriptFeedRef = useRef<HTMLDivElement>(null);

  // Keep the chronological transcript pinned to the newest line at the bottom.
  useEffect(() => {
    const feed = transcriptFeedRef.current;
    if (feed) {
      feed.scrollTop = feed.scrollHeight;
    }
  }, [utterances]);

  return (
    <section className="live-workspace">
      {/* Slim console bar — status + listening controls, kept out of the way so the
          three focus panels (transcript, assist, notes) lead. */}
      <section className={`console-bar${capturing ? " is-live" : ""}`}>
        <div className="console-status">
          <span className={`live-pill ${capturing ? "is-live" : active ? "is-idle" : ""}`}>
            {capturing ? (
              <span className="eq" aria-hidden>
                <span /><span /><span /><span /><span />
              </span>
            ) : (
              <span className="rec-dot" aria-hidden />
            )}
            {capturing ? "On air" : active ? "Idle" : meetingStatus}
          </span>
          <span className="session-meta">
            <span className="badge">{platform}</span>
            <span className="meta-item">{startedLabel}</span>
            <span className="meta-item">{audioSource}</span>
            {linkedSource ? <span className="meta-item">{linkedSource}</span> : null}
          </span>
          <span className="console-ticker" title={latestCaption?.text}>
            {latestCaption ? (
              <><span className="console-ticker-who">{displaySpeaker(latestCaption, speakerAliases)}:</span> {latestCaption.text}</>
            ) : (
              <span className="muted">Start listening to caption the meeting audio or your microphone.</span>
            )}
          </span>
        </div>

        <div className="console-controls">
          <label className="inline-select" title="Your microphone (your voice)">
            <span aria-hidden>🎙</span>
            <select value={micInput} onChange={(event) => setMicInput(event.target.value)} disabled={!active}>
              <option value="">Mic: off</option>
              {devices.map((device) => (
                <option key={`mic-${device.index}`} value={device.index}>{device.name}</option>
              ))}
            </select>
          </label>
          <label className="inline-select" title="Meeting audio — others (system/loopback)">
            <span aria-hidden>🔊</span>
            <select value={meetingInput} onChange={(event) => setMeetingInput(event.target.value)} disabled={!active}>
              <option value="">Others: off</option>
              {devices.map((device) => (
                <option key={`meeting-${device.index}`} value={device.index}>
                  {device.name}{isLoopbackDevice(device) ? " (loopback)" : ""}
                </option>
              ))}
            </select>
          </label>
          {capturing ? (
            <button type="button" className="danger" onClick={() => void stopCapture()} disabled={capturePending}>
              ■ Stop
            </button>
          ) : (
            <button type="button" onClick={() => void startCapture()} disabled={!active || capturePending}>
              ● Start listening
            </button>
          )}
        </div>
      </section>

      {(captureError || micOnlyWarning || (!hasLoopbackDevice && active) || capture?.sources.length) ? (
        <div className="console-strip">
          {captureError ? <span className="badge danger">{captureError}</span> : null}
          {capture?.sources.map((source) => (
            <span key={source.label} className={source.running ? "badge success" : "badge"}>
              {sourceLabel(source)} · {source.utterances}
            </span>
          ))}
          {micOnlyWarning ? (
            <span className="capture-warning">Mic only — it can’t hear app/browser audio. Pick a system-audio (loopback) device to caption a meeting.</span>
          ) : !hasLoopbackDevice && active ? (
            <span className="hint">No loopback device. Install <strong>BlackHole</strong> + a Multi-Output Device to caption meeting audio.</span>
          ) : null}
        </div>
      ) : null}

      {/* The transcript leads, Assist beside it, and Meeting notes reflows below
          (or into a right column on wide screens). */}
      <section className="workspace-split">
        <section className="card transcript-card panel-transcript">
          <div className="transcript-head">
            <h3>
              Transcript
              {capturing ? <span className="bubble-live">live</span> : null}
            </h3>
            <span className="rail-count">{utterances.length} lines</span>
          </div>
          {canDiarize ? (
            <div className="speaker-diarize-card" aria-label="Speaker diarization">
              <div>
                <span className="speaker-diarize-kicker">Diarization</span>
                <p>Remote audio is not separated yet. Run local diarization to discover speaker labels.</p>
              </div>
              <button type="button" className="secondary" onClick={() => void runDiarization()} disabled={diarizePending}>
                {diarizePending ? "Diarizing..." : "Diarize speakers"}
              </button>
              {diarizeError ? <p className="speaker-error">{diarizeError}</p> : null}
            </div>
          ) : null}
          {speakerError ? <p className="speaker-error inline-speaker-error">{speakerError}</p> : null}
          <div className="transcript-feed" ref={transcriptFeedRef}>
            {utterances.length ? utterances.map((utterance) => (
              <article
                key={utterance.id}
                className={`bubble ${utterance.speakerRole === "SELF" ? "bubble-self" : "bubble-other"}${utterance.interim ? " bubble-interim" : ""}`}
              >
                <header className="bubble-head">
                  {utterance.speakerKey && utterance.speakerRole !== "SELF" && editingSpeaker?.key === utterance.speakerKey && editingSpeaker.utteranceId === utterance.id ? (
                    <form
                      className="inline-speaker-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void renameSpeaker(utterance.speakerKey as number);
                      }}
                    >
                      <input
                        aria-label={`Rename ${utterance.speakerLabel ?? `Speaker ${utterance.speakerKey}`}`}
                        autoFocus
                        maxLength={80}
                        placeholder={utterance.speakerLabel ?? `Speaker ${utterance.speakerKey}`}
                        value={speakerDrafts[utterance.speakerKey] ?? ""}
                        onChange={(event) => setSpeakerDrafts((current) => ({ ...current, [utterance.speakerKey as number]: event.target.value }))}
                      />
                      <button type="submit" disabled={savingSpeakerKey === utterance.speakerKey}>
                        {savingSpeakerKey === utterance.speakerKey ? "Saving" : "Save"}
                      </button>
                      <button type="button" className="inline-speaker-cancel" onClick={() => cancelRenameSpeaker(utterance.speakerKey as number)}>
                        Cancel
                      </button>
                    </form>
                  ) : utterance.speakerKey && utterance.speakerRole !== "SELF" ? (
                    <button type="button" className="bubble-speaker speaker-name-button" onClick={() => beginRenameSpeaker(utterance)} title="Rename speaker">
                      {displaySpeaker(utterance, speakerAliases)}
                      <span aria-hidden>Edit</span>
                    </button>
                  ) : (
                    <span className="bubble-speaker">{displaySpeaker(utterance, speakerAliases)}</span>
                  )}
                  {utterance.interim ? (
                    <span className="bubble-live">refining</span>
                  ) : (
                    <span className="bubble-meta">{utterance.sourceChannel} · {new Date(utterance.startedAt).toLocaleTimeString()}</span>
                  )}
                </header>
                <p className="bubble-text">{utterance.text}</p>
              </article>
            )) : (
              <div className="empty-state">
                <span className="eq" aria-hidden>
                  <span /><span /><span /><span /><span />
                </span>
                <p>No transcript yet. Captions stream in here as the meeting is heard.</p>
              </div>
            )}
          </div>
        </section>

          <section className="card panel-assist">
            <div className="rail-eyebrow">
              <h3>Assist now</h3>
              <span className="rail-count">{assistItems.length || ""}</span>
            </div>
            {assistItems.length ? (
              <div className="assist-feed">
                {assistItems.map((item) => {
                  const meta = ASSIST_KINDS[item.kind];
                  return (
                    <article key={item.key} className={`assist-item assist-${item.kind.toLowerCase()}${isNewItem(item) ? " is-new" : ""}`}>
                      <header className="assist-item-head">
                        <span className="assist-kind"><span className="assist-icon" aria-hidden>{meta.icon}</span>{meta.label}</span>
                        <span className="assist-time">{isNewItem(item) ? <span className="assist-new">new</span> : null}{relativeTime(item.createdAt)}</span>
                      </header>
                      {item.kind === "QUESTION" ? (
                        <>
                          <p className="assist-question">{item.question}</p>
                          {item.reply ? (
                            <div className="assist-reply">
                              <span className="assist-reply-label">Suggested reply</span>
                              <p>{item.reply}</p>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p className="assist-body">{item.body}</p>
                      )}
                      {item.keywords.length ? (
                        <div className="kw-row">
                          {item.keywords.slice(0, 5).map((kw) => <span key={kw} className="kw">{kw}</span>)}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="muted">Questions, answer ideas, and action requests surface here the moment they’re heard.</p>
            )}
          </section>

          <section className="card panel-notes">
            <div className="rail-eyebrow">
              <h3>Meeting notes</h3>
              {latestNotes ? <span className="rail-count">synthesized</span> : null}
            </div>
            {hasNotes ? (
              <div className="notes-body">
                <div className="notes-grid">
                  <div className="notes-block">
                    <p className="notes-label">Briefing</p>
                    {latestNotes.summary ? (
                      <p className="message">{latestNotes.summary}</p>
                    ) : (
                      <p className="muted">—</p>
                    )}
                  </div>
                  <div className="notes-block">
                    <p className="notes-label">Action items</p>
                    {latestNotes.actionItems.length ? (
                      <ul className="notes-list">
                        {latestNotes.actionItems.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    ) : (
                      <p className="muted">—</p>
                    )}
                  </div>
                  <div className="notes-block">
                    <p className="notes-label">Open questions</p>
                    {latestNotes.openQuestions.length ? (
                      <ul className="notes-list questions">
                        {latestNotes.openQuestions.map((question) => <li key={question}>{question}</li>)}
                      </ul>
                    ) : (
                      <p className="muted">—</p>
                    )}
                  </div>
                </div>
                {latestNotes.model ? <p className="notes-model">via {latestNotes.model}</p> : null}
              </div>
            ) : (
              <div className="notes-body">
                <p className="muted">Synthesized briefing, action items, and open questions appear once enough of the meeting has been heard.</p>
              </div>
            )}
          </section>
      </section>
    </section>
  );
}

const LOOPBACK_PATTERN = /blackhole|aggregate|multi-?output|loopback|soundflower|virtual/i;

function isLoopbackDevice(device: AudioDevice): boolean {
  return LOOPBACK_PATTERN.test(device.name);
}

function pickDefaultMic(devices: AudioDevice[]): string {
  const macMic = devices.find((device) => /macbook.*microphone/i.test(device.name));
  if (macMic) {
    return macMic.index;
  }
  const anyMic = devices.find((device) => /microphone/i.test(device.name) && !isLoopbackDevice(device));
  if (anyMic) {
    return anyMic.index;
  }
  return "";
}

function pickDefaultMeeting(devices: AudioDevice[]): string {
  const loopback = devices.find(isLoopbackDevice);
  return loopback ? loopback.index : "";
}

function speakerLabel(role: SpeakerRole): string {
  if (role === "SELF") {
    return "You";
  }
  if (role === "OTHER") {
    return "Participant";
  }
  return "Unknown";
}

function buildSpeakerAliases(utterances: Utterance[]): Record<number, string> {
  const aliases: Record<number, string> = {};
  for (const utterance of utterances) {
    const speakerKey = speakerIdentityKey(utterance);
    if (speakerKey && utterance.speakerAlias) {
      aliases[speakerKey] = utterance.speakerAlias;
    }
  }
  return aliases;
}

function speakerIdentityKey(utterance: Utterance): number | undefined {
  return utterance.speakerKey;
}

function displaySpeaker(utterance: Utterance, aliases: Record<number, string>): string {
  if (utterance.speakerRole === "SELF") {
    return "You";
  }
  const speakerKey = speakerIdentityKey(utterance);
  if (speakerKey && aliases[speakerKey]) {
    return aliases[speakerKey];
  }
  if (speakerKey) {
    return utterance.speakerAlias ?? utterance.speakerLabel ?? `Speaker ${speakerKey}`;
  }
  return speakerLabel(utterance.speakerRole);
}

function sourceLabel(source: CaptureSourceStatus): string {
  return source.source === "MIC" ? "Microphone" : "Meeting audio";
}

// How long a freshly-arrived assist card keeps its "new" pulse.
const NEW_INSIGHT_MS = 12000;

const ASSIST_KINDS: Record<AssistItem["kind"], { icon: string; label: string }> = {
  QUESTION: { icon: "?", label: "Question for you" },
  ACTION: { icon: "✓", label: "Action item" },
  MENTION: { icon: "@", label: "Name mention" },
  NOTE: { icon: "•", label: "Note" },
};

function stripPrefix(text: string, prefix: RegExp): string {
  return text.replace(prefix, "").trim();
}

// Collapses the engine's raw insights (newest first) into display cards. A question
// and the answer suggestion emitted from the same utterance are merged so they read
// as one item; everything else stays a standalone card. Order is preserved, so the
// newest assist item is first.
function buildAssistItems(insights: Insight[]): AssistItem[] {
  const answerByUtterance = new Map<string, Insight>();
  const questionTextByUtterance = new Map<string, string>();
  for (const insight of insights) {
    const key = insight.relatedUtteranceIds[0] ?? insight.id;
    if (insight.kind === "ANSWER_SUGGESTION" && !answerByUtterance.has(key)) {
      answerByUtterance.set(key, insight);
    }
    if (insight.kind === "QUESTION_FOR_YOU" && !questionTextByUtterance.has(key)) {
      questionTextByUtterance.set(key, stripPrefix(insight.text, /^Possible question for you:\s*/i));
    }
  }

  const items: AssistItem[] = [];
  for (const insight of insights) {
    const utteranceKey = insight.relatedUtteranceIds[0] ?? insight.id;
    if (insight.kind === "ANSWER_SUGGESTION") {
      continue; // rendered with its question
    }
    if (insight.kind === "QUESTION_FOR_YOU") {
      const answer = answerByUtterance.get(utteranceKey);
      items.push({
        key: insight.id,
        ids: answer ? [insight.id, answer.id] : [insight.id],
        kind: "QUESTION",
        createdAt: insight.createdAt,
        question: stripPrefix(insight.text, /^Possible question for you:\s*/i),
        reply: answer ? stripPrefix(answer.text, /^Reply idea:\s*/i) : undefined,
        keywords: insight.keywords,
      });
    } else if (insight.kind === "ACTION_ITEM") {
      const body = stripPrefix(insight.text, /^Likely action item:\s*/i);
      // Skip an action that is just the same sentence already shown as a question
      // (e.g. "can you confirm?" matches both patterns) so the feed isn't doubled.
      if (questionTextByUtterance.get(utteranceKey) === body) {
        continue;
      }
      items.push({
        key: insight.id,
        ids: [insight.id],
        kind: "ACTION",
        createdAt: insight.createdAt,
        body,
        keywords: insight.keywords,
      });
    } else if (insight.kind === "NAME_MENTION") {
      items.push({
        key: insight.id,
        ids: [insight.id],
        kind: "MENTION",
        createdAt: insight.createdAt,
        body: stripPrefix(insight.text, /^Your name was mentioned:\s*/i),
        keywords: insight.keywords,
      });
    } else {
      items.push({
        key: insight.id,
        ids: [insight.id],
        kind: "NOTE",
        createdAt: insight.createdAt,
        body: insight.text,
        keywords: insight.keywords,
      });
    }
  }
  return items;
}

// Compact relative time for an assist card ("just now", "3m", "12:04").
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const seconds = Math.round(diffMs / 1000);
  if (seconds < 10) {
    return "just now";
  }
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
