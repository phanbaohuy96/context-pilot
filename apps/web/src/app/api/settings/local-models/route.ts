import { NextResponse } from "next/server";
import { detectLocalProvider, isLoopbackBaseUrl, listLocalModels } from "../../../../lib/local-models";

export const dynamic = "force-dynamic";

// Backs the /settings Local LLM fields:
//   GET ?detect=1     → probe the well-known local endpoints, return the first that answers.
//   GET ?baseUrl=...  → list models for that endpoint (`reachable` distinguishes "no server"
//                       from "server with an empty model list").
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);

  if (searchParams.get("detect")) {
    const detected = await detectLocalProvider();
    return NextResponse.json({ detected });
  }

  const baseUrl = searchParams.get("baseUrl")?.trim();
  if (!baseUrl) {
    return NextResponse.json({ error: "baseUrl is required." }, { status: 400 });
  }
  // Only loopback targets are allowed (SSRF guard, see lib/local-models). A LAN/remote URL still
  // works as a provider — the model list just can't be fetched for it, so type the model name.
  if (!(await isLoopbackBaseUrl(baseUrl))) {
    return NextResponse.json(
      { error: "Model auto-listing needs a local (loopback) server — type the model name instead." },
      { status: 400 },
    );
  }

  const models = await listLocalModels(baseUrl);
  return NextResponse.json({ models: models ?? [], reachable: models !== null });
}
