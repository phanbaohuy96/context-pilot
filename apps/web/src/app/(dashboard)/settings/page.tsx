import { revalidatePath } from "next/cache";
import type { AiProviderKind } from "@context-pilot/core";
import {
  encryptSettingSecret,
  getAiProviderSettingsView,
  prisma,
} from "@context-pilot/db";
import { getOrCreateDefaultTenant } from "../../../lib/tenant";

export const dynamic = "force-dynamic";

const providerOptions: Array<{ value: AiProviderKind; label: string }> = [
  { value: "LOCAL_OPENAI", label: "Local LLM / Ollama" },
  { value: "CLAUDE_CODE_CLI", label: "Claude Code CLI" },
  { value: "CODEX_CLI", label: "Codex CLI" },
];

async function saveSettings(formData: FormData) {
  "use server";

  const tenant = await getOrCreateDefaultTenant();
  const localApiKey = textValue(formData.get("localApiKey"));
  const clearLocalApiKey = formData.get("clearLocalApiKey") === "on";
  const localApiKeyData = localApiKey
    ? { localApiKeyEncrypted: encryptSettingSecret(localApiKey) }
    : clearLocalApiKey
      ? { localApiKeyEncrypted: null }
      : {};

  await prisma.aiProviderSettings.upsert({
    where: { tenantId: tenant.id },
    update: {
      summarizationProvider: providerValue(formData.get("summarizationProvider")),
      askAgentProvider: providerValue(formData.get("askAgentProvider")),
      meetingNotesProvider: providerValue(formData.get("meetingNotesProvider")),
      localBaseUrl: nullableText(formData.get("localBaseUrl")),
      localModel: nullableText(formData.get("localModel")),
      claudeCommand: nullableText(formData.get("claudeCommand")),
      claudeWorkdir: nullableText(formData.get("claudeWorkdir")),
      claudeTimeoutMs: timeoutValue(formData.get("claudeTimeoutMs")),
      codexCommand: nullableText(formData.get("codexCommand")),
      codexWorkdir: nullableText(formData.get("codexWorkdir")),
      codexModel: nullableText(formData.get("codexModel")),
      codexTimeoutMs: timeoutValue(formData.get("codexTimeoutMs")),
      ...localApiKeyData,
    },
    create: {
      tenantId: tenant.id,
      summarizationProvider: providerValue(formData.get("summarizationProvider")),
      askAgentProvider: providerValue(formData.get("askAgentProvider")),
      meetingNotesProvider: providerValue(formData.get("meetingNotesProvider")),
      localBaseUrl: nullableText(formData.get("localBaseUrl")),
      localModel: nullableText(formData.get("localModel")),
      claudeCommand: nullableText(formData.get("claudeCommand")),
      claudeWorkdir: nullableText(formData.get("claudeWorkdir")),
      claudeTimeoutMs: timeoutValue(formData.get("claudeTimeoutMs")),
      codexCommand: nullableText(formData.get("codexCommand")),
      codexWorkdir: nullableText(formData.get("codexWorkdir")),
      codexModel: nullableText(formData.get("codexModel")),
      codexTimeoutMs: timeoutValue(formData.get("codexTimeoutMs")),
      ...localApiKeyData,
    },
  });

  revalidatePath("/settings");
}

export default async function SettingsPage() {
  const tenant = await getOrCreateDefaultTenant();
  const settings = await prisma.aiProviderSettings.findUnique({ where: { tenantId: tenant.id } });
  const view = getAiProviderSettingsView(settings);

  return (
    <>
      <header className="page-header">
        <h2>AI provider settings</h2>
        <p>Choose tenant-wide defaults for Teams summarization, the ask agent, and rolling meeting notes.</p>
      </header>

      <form action={saveSettings} className="stack">
        <section className="card form-grid">
          <h3>Feature defaults</h3>
          <section className="grid grid-3">
            <ProviderSelect
              name="summarizationProvider"
              label="Teams summaries"
              defaultValue={view.summarizationProvider}
            />
            <ProviderSelect
              name="askAgentProvider"
              label="Ask agent"
              defaultValue={view.askAgentProvider}
            />
            <ProviderSelect
              name="meetingNotesProvider"
              label="Meeting notes"
              defaultValue={view.meetingNotesProvider}
            />
          </section>
          {!view.meetingNotesEnabled ? (
            <p className="muted">Rolling meeting notes are disabled until MEETING_NOTES=true.</p>
          ) : null}
        </section>

        <section className="grid grid-3">
          <section className="card form-grid">
            <h3>Local LLM / Ollama</h3>
            <label>
              Base URL
              <input name="localBaseUrl" defaultValue={view.localBaseUrl} placeholder="http://localhost:11434/v1" />
            </label>
            <label>
              Model
              <input name="localModel" defaultValue={view.localModel} placeholder="llama3.1" />
            </label>
            <label>
              API key
              <input name="localApiKey" type="password" placeholder={view.hasLocalApiKey ? "Saved key present" : "Optional"} />
            </label>
            <label className="inline-check">
              <input name="clearLocalApiKey" type="checkbox" />
              Remove saved local API key
            </label>
          </section>

          <section className="card form-grid">
            <h3>Claude Code CLI</h3>
            <label>
              Command
              <input name="claudeCommand" defaultValue={view.claudeCommand} placeholder="claude" />
            </label>
            <label>
              Working directory
              <input name="claudeWorkdir" defaultValue={view.claudeWorkdir} placeholder="/tmp/context-pilot-agent" />
            </label>
            <label>
              Timeout (ms)
              <input name="claudeTimeoutMs" type="number" min="1000" step="1000" defaultValue={view.claudeTimeoutMs} />
            </label>
          </section>

          <section className="card form-grid">
            <h3>Codex CLI</h3>
            <label>
              Command
              <input name="codexCommand" defaultValue={view.codexCommand} placeholder="codex" />
            </label>
            <label>
              Working directory
              <input name="codexWorkdir" defaultValue={view.codexWorkdir} placeholder="/tmp/context-pilot-agent" />
            </label>
            <label>
              Model
              <input name="codexModel" defaultValue={view.codexModel} placeholder="Optional" />
            </label>
            <label>
              Timeout (ms)
              <input name="codexTimeoutMs" type="number" min="1000" step="1000" defaultValue={view.codexTimeoutMs} />
            </label>
          </section>
        </section>

        <div>
          <button type="submit">Save settings</button>
        </div>
      </form>
    </>
  );
}

function ProviderSelect({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: AiProviderKind;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={defaultValue}>
        {providerOptions.map((provider) => (
          <option key={provider.value} value={provider.value}>
            {provider.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function providerValue(value: FormDataEntryValue | null): AiProviderKind {
  const text = textValue(value);
  if (text === "CLAUDE_CODE_CLI" || text === "CODEX_CLI") {
    return text;
  }
  return "LOCAL_OPENAI";
}

function nullableText(value: FormDataEntryValue | null): string | null {
  return textValue(value) || null;
}

function textValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function timeoutValue(value: FormDataEntryValue | null): number | null {
  const parsed = Number(textValue(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}
