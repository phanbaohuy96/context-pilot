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
  speakerLabel?: string;
};

type RawUtterance = Omit<Utterance, "interim" | "speakerLabel"> & {
  engineMetadata?: { interim?: boolean; speakerLabel?: string } | null;
};

type Insight = {
  id: string;
  kind: string;
  text: string;
  keywords: string[];
  createdAt: string;
};

type Summary = {
  id: string;
  summary: string;
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
    speakerLabel: raw.engineMetadata?.speakerLabel,
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
  initialUtterances: Utterance[];
  initialInsights: Insight[];
  initialSummaries: Summary[];
};

export function LiveMeetingWorkspace({
  meetingId,
  status,
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

  const latestCaption = useMemo(() => utterances[utterances.length - 1], [utterances]);
  const rollingNotes = useMemo(() => buildRollingNotes(utterances), [utterances]);
  const latestInsights = insights.slice(0, 6);
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
      <section className="grid grid-60-40">
        <section className="card stack">
          <h3>Assist now</h3>
          {latestInsights.length ? latestInsights.map((insight) => (
            <article key={insight.id} className="assist-card">
              <span className="badge">{formatInsightKind(insight.kind)}</span>
              <p className="message">{insight.text}</p>
              <p className="muted">Keywords: {insight.keywords.join(", ") || "None"}</p>
            </article>
          )) : (
            <p className="muted">Questions and action requests will appear here while the meeting audio is transcribed.</p>
          )}
        </section>

        <section className="card stack">
          <h3>Meeting notes</h3>
          {rollingNotes.length ? (
            <ul>
              {rollingNotes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          ) : (
            <p className="muted">Notes will appear from transcript highlights. LLM summaries can be added next.</p>
          )}
        </section>
      </section>

      <section className="grid grid-2">
        <section className="card stack transcript-card">
          <div className="transcript-head">
            <h3>Transcript stream</h3>
            <span className="muted">{utterances.length} lines</span>
          </div>
          <div className="transcript-feed" ref={transcriptFeedRef}>
            {utterances.length ? utterances.map((utterance) => (
              <article
                key={utterance.id}
                className={`bubble ${utterance.speakerRole === "SELF" ? "bubble-self" : "bubble-other"}${utterance.interim ? " bubble-interim" : ""}`}
              >
                <header className="bubble-head">
                  <span className="bubble-speaker">{displaySpeaker(utterance)}</span>
                  {utterance.interim ? (
                    <span className="bubble-live">refining</span>
                  ) : (
                    <span className="bubble-meta">{utterance.sourceChannel} · {new Date(utterance.startedAt).toLocaleTimeString()}</span>
                  )}
                </header>
                <p className="bubble-text">{utterance.text}</p>
              </article>
            )) : (
              <p className="muted">No transcript yet.</p>
            )}
          </div>
        </section>

        <section className="card stack">
          <h3>Summaries</h3>
          {summaries.length ? summaries.map((summary) => (
            <article key={summary.id} className="card">
              <p className="message">{summary.summary}</p>
              <p className="muted">Model: {summary.model}</p>
            </article>
          )) : (
            <p className="muted">Summary generation is next. For now, this page focuses on live captions and assist cards.</p>
          )}
        </section>
      </section>

      <section className="card hero-card stack">
        <div className="grid grid-2">
          <div>
            <span className={capturing ? "badge success" : active ? "badge" : "badge danger"}>
              {capturing ? "Listening live" : active ? "Idle — not listening" : meetingStatus}
            </span>
            <h3>Live caption</h3>
            <p className="live-caption">
              {latestCaption ? latestCaption.text : "Start listening, then play any meeting audio or speak into the microphone."}
            </p>
            {latestCaption ? (
              <p className="muted">{displaySpeaker(latestCaption)} · {latestCaption.sourceChannel} · {new Date(latestCaption.startedAt).toLocaleTimeString()}</p>
            ) : null}
          </div>

          <div className="capture-panel stack">
            <div className="capture-head">
              <h3>Listening controls</h3>
              <span className={capturing ? "dot dot-live" : "dot"} aria-hidden />
            </div>
            <p className="muted">Your microphone captures <strong>your</strong> voice. To caption the meeting/video audio playing on this Mac, pick a system-audio (loopback) device — a plain microphone cannot hear app or browser audio.</p>
            <label>
              Your microphone (your voice)
              <select value={micInput} onChange={(event) => setMicInput(event.target.value)} disabled={!active}>
                <option value="">Off</option>
                {devices.map((device) => (
                  <option key={`mic-${device.index}`} value={device.index}>{device.index} {device.name}</option>
                ))}
              </select>
            </label>
            <label>
              Capture meeting audio from (others)
              <select value={meetingInput} onChange={(event) => setMeetingInput(event.target.value)} disabled={!active}>
                <option value="">Off</option>
                {devices.map((device) => (
                  <option key={`meeting-${device.index}`} value={device.index}>
                    {device.index} {device.name}{isLoopbackDevice(device) ? " (loopback)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">These are capture inputs, not outputs — your headphones/speakers are set in macOS Sound, not here.</p>
            {!hasLoopbackDevice ? (
              <p className="muted">No loopback device detected. Install <strong>BlackHole</strong> and route output through a Multi-Output Device to caption live meeting audio.</p>
            ) : null}
            <div className="capture-actions">
              {capturing ? (
                <button type="button" className="danger" onClick={() => void stopCapture()} disabled={capturePending}>
                  Stop listening
                </button>
              ) : (
                <button type="button" onClick={() => void startCapture()} disabled={!active || capturePending}>
                  Start listening
                </button>
              )}
            </div>
            {captureError ? <span className="badge danger">{captureError}</span> : null}
            {micOnlyWarning ? (
              <p className="capture-warning">Listening on the microphone only — it can’t hear audio playing from apps or the browser. Select a system-audio (loopback) device above to caption a meeting or video.</p>
            ) : null}
            {capture?.sources.length ? (
              <ul className="capture-status">
                {capture.sources.map((source) => (
                  <li key={source.label}>
                    <span className={source.running ? "badge success" : "badge"}>{sourceLabel(source)}</span>
                    <span className="muted"> {source.utterances} lines{source.lastError ? ` · ${source.lastError}` : ""}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Choose your microphone and system-audio device, then click Start listening. Audio is transcribed locally and chunks are deleted right after.</p>
            )}
          </div>
        </div>
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

// Prefers the diarized "Speaker N" label when present; otherwise falls back to the
// coarse role label ("Participant"). Your own mic is always "You".
function displaySpeaker(utterance: Utterance): string {
  if (utterance.speakerRole === "SELF") {
    return "You";
  }
  return utterance.speakerLabel ?? speakerLabel(utterance.speakerRole);
}

function sourceLabel(source: CaptureSourceStatus): string {
  return source.source === "MIC" ? "Microphone" : "Meeting audio";
}

function buildRollingNotes(utterances: Utterance[]): string[] {
  return utterances
    .filter((utterance) => utterance.speakerRole !== "SELF")
    .map((utterance) => utterance.text)
    .filter((text) => text.length > 40)
    .slice(-5);
}

function formatInsightKind(kind: string): string {
  return kind.toLowerCase().replaceAll("_", " ");
}
