"use client";

import { useEffect, useState } from "react";
import { FieldLabel } from "./FieldLabel";

type Props = {
  defaultBaseUrl: string;
  defaultModel: string;
  hasApiKey: boolean;
};

type ModelsResponse = { models: string[]; reachable: boolean };
type DetectResponse = { detected: { baseUrl: string; models: string[] } | null };

// Local LLM / Ollama fields for /settings. Renders inside the page's server-action <form>, so
// the `name="localBaseUrl"` / `name="localModel"` controls submit normally. Adds two niceties
// over plain inputs: auto-detect of a running local provider, and a model dropdown populated
// from the endpoint's /models route (falling back to a free-text input when unreachable).
export function LocalProviderFields({ defaultBaseUrl, defaultModel, hasApiKey }: Props) {
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
  const [model, setModel] = useState(defaultModel);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function loadModels(url: string): Promise<void> {
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch(`/api/settings/local-models?baseUrl=${encodeURIComponent(url)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setModels([]);
        setStatus(body.error ?? "Could not list models for that URL.");
        return;
      }
      const body = (await res.json()) as ModelsResponse;
      setModels(body.models);
      if (!body.reachable) {
        setStatus(`No OpenAI-compatible server answered at ${url}.`);
      } else if (!body.models.length) {
        setStatus("Server reachable, but it reported no models.");
      } else {
        setStatus(`${body.models.length} model${body.models.length === 1 ? "" : "s"} available.`);
      }
    } catch {
      setModels([]);
      setStatus("Could not reach the model list endpoint.");
    } finally {
      setLoading(false);
    }
  }

  async function detect(): Promise<void> {
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch("/api/settings/local-models?detect=1", { cache: "no-store" });
      const body = (await res.json()) as DetectResponse;
      if (!body.detected) {
        setStatus("No local provider found on the usual ports (Ollama 11434, LM Studio 1234).");
        return;
      }
      setBaseUrl(body.detected.baseUrl);
      setModels(body.detected.models);
      if (body.detected.models.length && !body.detected.models.includes(model)) {
        setModel(body.detected.models[0]);
      }
      setStatus(`Detected ${body.detected.baseUrl} (${body.detected.models.length} models).`);
    } catch {
      setStatus("Detection failed.");
    } finally {
      setLoading(false);
    }
  }

  // Populate the dropdown once for the saved/default base URL when the section first renders.
  useEffect(() => {
    void loadModels(defaultBaseUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the saved model as a suggestion even if the running server no longer lists it.
  const suggestions = Array.from(new Set([model, ...models].filter(Boolean)));

  return (
    <div className="form-grid">
      <FieldLabel
        label="Base URL"
        hint="The OpenAI-compatible endpoint of your local model server — e.g. Ollama (http://localhost:11434/v1) or LM Studio (http://localhost:1234/v1). Auto-detect probes the usual local ports. Model auto-listing only works for a loopback (localhost) server; a LAN/remote URL still works as a provider — just type the model name."
      >
        <div className="field-row">
          <input
            name="localBaseUrl"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="http://localhost:11434/v1"
          />
          <button type="button" className="secondary" onClick={() => void detect()} disabled={loading}>
            Auto-detect
          </button>
        </div>
      </FieldLabel>

      <FieldLabel
        label="Model"
        hint="The model name sent to the server (e.g. llama3.1). When a loopback server is reachable, its installed models appear as suggestions, but you can always type any name (e.g. a model the server will pull on first use). Refresh re-reads the list."
      >
        <div className="field-row">
          {/* Free-text input with datalist suggestions: pick a listed model OR type any name. */}
          <input
            name="localModel"
            list="local-model-options"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="llama3.1"
          />
          <datalist id="local-model-options">
            {suggestions.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
          <button type="button" className="secondary" onClick={() => void loadModels(baseUrl)} disabled={loading}>
            {models.length ? "Refresh" : "Load models"}
          </button>
        </div>
      </FieldLabel>

      {status || loading ? <p className="muted">{loading ? "Checking…" : status}</p> : null}

      <FieldLabel
        label="API key"
        hint="Optional bearer token, only if your local server requires one (Ollama and LM Studio usually don't). Stored encrypted with SETTINGS_ENCRYPTION_KEY and never shown back — leave blank to keep the saved key."
      >
        <input name="localApiKey" type="password" placeholder={hasApiKey ? "Saved key present" : "Optional"} />
      </FieldLabel>
      <label className="inline-check">
        <input name="clearLocalApiKey" type="checkbox" />
        Remove saved local API key
      </label>
    </div>
  );
}
