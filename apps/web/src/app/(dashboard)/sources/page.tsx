import { revalidatePath } from "next/cache";
import { buildGraphResourceForSource } from "@teams-observer/graph";
import { isHighSensitivitySource, monitoredSourceInputSchema } from "@teams-observer/core";
import { prisma } from "@teams-observer/db";
import { SubscribeButton } from "../../../components/SubscribeButton";
import { TeamsChatPicker } from "../../../components/TeamsChatPicker";
import { getOrCreateDefaultTenant } from "../../../lib/tenant";

export const dynamic = "force-dynamic";

async function approveSource(formData: FormData) {
  "use server";

  const parsed = monitoredSourceInputSchema.parse({
    displayName: formData.get("displayName"),
    sourceType: formData.get("sourceType"),
    teamId: emptyToUndefined(formData.get("teamId")),
    channelId: emptyToUndefined(formData.get("channelId")),
    chatId: emptyToUndefined(formData.get("chatId")),
  });

  const tenant = await getOrCreateDefaultTenant();
  const graphResource = buildGraphResourceForSource(parsed);
  const source = await prisma.monitoredSource.create({
    data: {
      tenantId: tenant.id,
      displayName: parsed.displayName,
      sourceType: parsed.sourceType,
      status: "APPROVED",
      teamId: parsed.teamId,
      channelId: parsed.channelId,
      chatId: parsed.chatId,
      graphResource,
      approvedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      action: "source.approved",
      targetType: "MonitoredSource",
      targetId: source.id,
      metadata: { sourceType: source.sourceType, graphResource },
    },
  });

  revalidatePath("/sources");
}

async function pauseSource(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "");
  await prisma.monitoredSource.update({ where: { id }, data: { status: "PAUSED" } });
  revalidatePath("/sources");
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

export default async function SourcesPage() {
  const sources = await prisma.monitoredSource.findMany({
    include: { subscriptions: { orderBy: { expiresAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <header className="page-header">
        <h2>Connect Teams and choose a chat</h2>
        <p>Connect your Teams identity, pick an authorized chat, then open its chat and agent workspace.</p>
      </header>

      <section className="grid grid-2">
        <TeamsChatPicker />

        <section className="card stack">
          <div>
            <h3>Microsoft Graph setup</h3>
            <p className="muted">
              Chat discovery uses delegated Teams access. Subscriptions and webhook ingestion still use the configured Azure app credentials.
            </p>
          </div>
          <ul>
            <li>Delegated env: AZURE_REDIRECT_URI and GRAPH_DELEGATED_SCOPES.</li>
            <li>App env: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET.</li>
            <li>Webhook env: GRAPH_WEBHOOK_URL or APP_BASE_URL.</li>
            <li>Security env: GRAPH_CLIENT_STATE.</li>
          </ul>
        </section>
      </section>

      <section className="card form-grid" style={{ marginTop: 16 }}>
        <h3>Manual source approval fallback</h3>
        <p className="muted">
          Use this when Teams delegated chat listing is unavailable or when approving a Teams channel by known IDs.
        </p>
        <form action={approveSource} className="form-grid">
          <label>
            Display name
            <input name="displayName" placeholder="Client discovery channel" required />
          </label>
          <label>
            Source type
            <select name="sourceType" required defaultValue="TEAM_CHANNEL">
              <option value="TEAM_CHANNEL">Teams channel</option>
              <option value="GROUP_CHAT">Group chat</option>
              <option value="CHAT">Chat</option>
            </select>
          </label>
          <label>
            Team ID
            <input name="teamId" placeholder="Required for Teams channel" />
          </label>
          <label>
            Channel ID
            <input name="channelId" placeholder="Required for Teams channel" />
          </label>
          <label>
            Chat ID
            <input name="chatId" placeholder="Required for group/private chat" />
          </label>
          <button type="submit">Approve source</button>
          <p className="muted">Group and private chats are high sensitivity; confirm stakeholder consent before adding them.</p>
        </form>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h3>Approved sources</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Graph resource</th>
              <th>Subscription</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => {
              const latestSubscription = source.subscriptions[0];
              return (
                <tr key={source.id}>
                  <td>{source.displayName}</td>
                  <td>
                    <span className={isHighSensitivitySource(source.sourceType) ? "badge danger" : "badge"}>
                      {source.sourceType}
                    </span>
                  </td>
                  <td>{source.status}</td>
                  <td><code>{source.graphResource ?? "Not created"}</code></td>
                  <td>
                    {latestSubscription ? `${latestSubscription.status} until ${latestSubscription.expiresAt.toISOString()}` : "None"}
                  </td>
                  <td className="stack">
                    <a className="button" href={`/chats/${source.id}`}>Open workspace</a>
                    <SubscribeButton sourceId={source.id} />
                    <form action={pauseSource}>
                      <input type="hidden" name="id" value={source.id} />
                      <button className="secondary" type="submit">Pause</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
