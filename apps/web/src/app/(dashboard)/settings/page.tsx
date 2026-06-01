import { revalidatePath } from "next/cache";
import type { AiProviderKind } from "@context-pilot/core";
import {
  encryptSettingSecret,
  getAiProviderSettingsView,
  prisma,
} from "@context-pilot/db";
import type { ReactNode } from "react";
import { getOrCreateDefaultTenant } from "../../../lib/tenant";
import { LocalProviderFields } from "../../../components/LocalProviderFields";
import { InfoHint } from "../../../components/InfoHint";
import { FieldLabel } from "../../../components/FieldLabel";

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

  // Build the field set once and reuse it for both branches of the upsert so a new field can't
  // be added to create-but-not-update (or vice-versa).
  const fields = {
    summarizationProvider: providerValue(formData.get("summarizationProvider")),
    askAgentProvider: providerValue(formData.get("askAgentProvider")),
    meetingNotesProvider: providerValue(formData.get("meetingNotesProvider")),
    meetingNotesEnabled: formData.get("meetingNotesEnabled") === "on",
    diarizationEnabled: formData.get("diarizationEnabled") === "on",
    meetingCorrectionEnabled: formData.get("meetingCorrectionEnabled") === "on",
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
  };

  await prisma.aiProviderSettings.upsert({
    where: { tenantId: tenant.id },
    update: fields,
    create: { tenantId: tenant.id, ...fields },
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
          <div className="heading-row">
            <h3>Feature defaults</h3>
            <InfoHint text="Tenant-wide provider choice for Teams thread summaries and the ask agent. Each can use a different backend." />
          </div>
          <section className="grid grid-2">
            <ProviderSelect
              name="summarizationProvider"
              label="Teams summaries"
              hint="Backend that summarizes each Teams thread and extracts requirement cards when new approved messages arrive (the worker's summarize-thread job)."
              defaultValue={view.summarizationProvider}
            />
            <ProviderSelect
              name="askAgentProvider"
              label="Ask agent"
              hint="Backend that answers your questions on the /agent page over the stored Teams messages, summaries, and requirements."
              defaultValue={view.askAgentProvider}
            />
          </section>
        </section>

        <section className="card form-grid">
          <div className="heading-row">
            <h3>Meeting assistant</h3>
            <InfoHint text="Live meeting features. All three toggles below reuse the Meeting AI provider. They are opt-in because they send transcript audio/text to a model or download a local model." />
          </div>
          <ProviderSelect
            name="meetingNotesProvider"
            label="Meeting AI provider"
            hint="The single backend used for every meeting AI task: rolling notes, fragment merging, and on-demand transcript translation. The toggles below decide which of those run."
            defaultValue={view.meetingNotesProvider}
          />
          <CheckboxField
            name="meetingNotesEnabled"
            defaultChecked={view.meetingNotesEnabled}
            hint="When on, the live transcript is periodically summarized into a rolling note (summary, open questions, action items) during the meeting. Off by default because it sends transcript text to the provider above."
          >
            Generate rolling meeting notes
          </CheckboxField>
          <CheckboxField
            name="diarizationEnabled"
            defaultChecked={view.diarizationEnabled}
            hint="When on, the others channel is split into distinct Speaker 1 / Speaker 2 / … using a local voice-embedding model (downloaded to the cache on first use). Off by default because of that download and the extra processing. Unlike the other two toggles, this is read when you press Start listening, so changing it takes effect on the next session, not the current one."
          >
            Diarize the others channel into separate speakers
          </CheckboxField>
          <CheckboxField
            name="meetingCorrectionEnabled"
            defaultChecked={view.meetingCorrectionEnabled}
            hint="When on, consecutive same-speaker lines that were split mid-sentence are stitched into one cleaned-up line by the provider above. The original fragments are kept but hidden."
          >
            Merge fragmented transcript lines into full sentences
          </CheckboxField>
        </section>

        <section className="card form-grid">
          <div className="heading-row">
            <h3>Provider configuration</h3>
            <InfoHint text="Connection details for each backend. Only the provider(s) selected above are used; the rest are ignored. Expand a section to edit it." />
          </div>
          <details>
            <summary>Local LLM / Ollama</summary>
            <LocalProviderFields
              defaultBaseUrl={view.localBaseUrl}
              defaultModel={view.localModel}
              hasApiKey={view.hasLocalApiKey}
            />
          </details>

          <details>
            <summary>Claude Code CLI</summary>
            <div className="form-grid">
              <FieldLabel
                label="Command"
                hint="The Claude Code CLI executable to spawn (run as `claude -p`). Default: claude. Must be installed and on the server process's PATH."
              >
                <input name="claudeCommand" defaultValue={view.claudeCommand} placeholder="claude" />
              </FieldLabel>
              <FieldLabel
                label="Working directory"
                hint="Directory the claude CLI is spawned in. Optional — leave blank to use the process default. Useful if the CLI needs a specific project/config location."
              >
                <input name="claudeWorkdir" defaultValue={view.claudeWorkdir} placeholder="/tmp/context-pilot-agent" />
              </FieldLabel>
              <FieldLabel
                label="Timeout (ms)"
                hint="How long to wait for the CLI to return before the request fails. Default: 120000 (2 minutes)."
              >
                <input name="claudeTimeoutMs" type="number" min="1000" step="1000" defaultValue={view.claudeTimeoutMs} />
              </FieldLabel>
            </div>
          </details>

          <details>
            <summary>Codex CLI</summary>
            <div className="form-grid">
              <FieldLabel
                label="Command"
                hint="The Codex CLI executable to spawn (run as `codex exec` with a read-only sandbox). Default: codex. Must be installed and on the server process's PATH."
              >
                <input name="codexCommand" defaultValue={view.codexCommand} placeholder="codex" />
              </FieldLabel>
              <FieldLabel
                label="Working directory"
                hint="Directory codex exec is spawned in. Optional — leave blank to use the process default."
              >
                <input name="codexWorkdir" defaultValue={view.codexWorkdir} placeholder="/tmp/context-pilot-agent" />
              </FieldLabel>
              <FieldLabel
                label="Model"
                hint="Optional model override passed to codex exec. Leave blank to use the Codex CLI's own configured default."
              >
                <input name="codexModel" defaultValue={view.codexModel} placeholder="Optional" />
              </FieldLabel>
              <FieldLabel
                label="Timeout (ms)"
                hint="How long to wait for the CLI to return before the request fails. Default: 120000 (2 minutes)."
              >
                <input name="codexTimeoutMs" type="number" min="1000" step="1000" defaultValue={view.codexTimeoutMs} />
              </FieldLabel>
            </div>
          </details>
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
  hint,
  defaultValue,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue: AiProviderKind;
}) {
  return (
    <FieldLabel label={label} hint={hint}>
      <select name={name} defaultValue={defaultValue}>
        {providerOptions.map((provider) => (
          <option key={provider.value} value={provider.value}>
            {provider.label}
          </option>
        ))}
      </select>
    </FieldLabel>
  );
}

// A checkbox row with its own "(i)" detail bubble after the inline description.
function CheckboxField({
  name,
  defaultChecked,
  children,
  hint,
}: {
  name: string;
  defaultChecked: boolean;
  children: ReactNode;
  hint: string;
}) {
  return (
    <div className="check-row">
      <label className="inline-check">
        <input name={name} type="checkbox" defaultChecked={defaultChecked} />
        {children}
      </label>
      <InfoHint text={hint} />
    </div>
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
