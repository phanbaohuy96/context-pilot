import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createMeetingSessionSchema } from "@teams-observer/core";
import { prisma } from "@teams-observer/db";
import { getOrCreateDefaultTenant } from "../../../lib/tenant";

export const dynamic = "force-dynamic";

async function startMeeting(formData: FormData) {
  "use server";

  const input = createMeetingSessionSchema.parse({
    title: formData.get("title"),
    platform: formData.get("platform"),
    externalContextId: emptyToUndefined(formData.get("externalContextId")),
  });
  const tenant = await getOrCreateDefaultTenant();
  const meeting = await prisma.meetingSession.create({
    data: {
      tenantId: tenant.id,
      title: input.title,
      platform: input.platform,
      externalContextId: input.externalContextId,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      action: "meeting.started",
      targetType: "MeetingSession",
      targetId: meeting.id,
      metadata: { platform: meeting.platform },
    },
  });

  revalidatePath("/meetings");
  redirect(`/meetings/${meeting.id}`);
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

export default async function MeetingsPage() {
  const meetings = await prisma.meetingSession.findMany({
    include: {
      source: true,
      _count: { select: { utterances: true, insights: true, summaries: true } },
    },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return (
    <>
      <header className="page-header">
        <h2>Live meeting assistant</h2>
        <p>Start a session, choose your audio devices, and click Start listening to get live captions, notes, and private assist cards.</p>
      </header>

      <section className="grid grid-2">
        <section className="card form-grid">
          <h3>1. Start a live session</h3>
          <p className="muted">Works with any meeting provider because it listens to local macOS audio and microphone inputs, not provider APIs.</p>
          <form action={startMeeting} className="form-grid">
            <label>
              Meeting title
              <input name="title" placeholder="Client status call" required />
            </label>
            <label>
              Provider label
              <select name="platform" defaultValue="OTHER">
                <option value="TEAMS">Microsoft Teams</option>
                <option value="GOOGLE_MEET">Google Meet</option>
                <option value="ZOOM">Zoom</option>
                <option value="BROWSER">Browser meeting</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label>
              Optional context ID
              <input name="externalContextId" placeholder="Calendar link, meeting code, or note" />
            </label>
            <button type="submit">Start session</button>
          </form>
        </section>

        <section className="card stack">
          <h3>2. Listen privately</h3>
          <p className="muted">On the meeting screen, pick your microphone and system-audio (loopback) device, then click Start listening.</p>
          <ul>
            <li>Microphone input becomes <strong>SELF</strong> transcript.</li>
            <li>Meeting/system audio becomes <strong>OTHER</strong> transcript.</li>
            <li>Raw audio chunks are temporary and deleted after transcription.</li>
            <li>Question and action assist cards stay private in this dashboard.</li>
          </ul>
        </section>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h3>Recent meeting sessions</h3>
        {meetings.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Started</th>
                <th>Transcript</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((meeting) => (
                <tr key={meeting.id}>
                  <td>{meeting.title}</td>
                  <td><span className="badge">{meeting.platform}</span></td>
                  <td>{meeting.status}</td>
                  <td>{meeting.startedAt.toISOString()}</td>
                  <td>{meeting._count.utterances} utterances</td>
                  <td><a className="button" href={`/meetings/${meeting.id}`}>Open</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No meeting sessions yet.</p>
        )}
      </section>
    </>
  );
}
