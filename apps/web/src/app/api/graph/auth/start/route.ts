import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const oauthStateCookie = "teams_graph_oauth_state";

export async function GET(): Promise<Response> {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;

  if (!tenantId || !clientId) {
    return NextResponse.json(
      { error: "AZURE_TENANT_ID and AZURE_CLIENT_ID are required to connect Teams." },
      { status: 500 },
    );
  }

  const state = randomBytes(24).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set(oauthStateCookie, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });

  const redirectUri = getRedirectUri();
  const scopes = process.env.GRAPH_DELEGATED_SCOPES ?? "User.Read Chat.ReadBasic Chat.Read";
  const authorizationUrl = new URL(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize`,
  );

  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_mode", "query");
  authorizationUrl.searchParams.set("scope", scopes);
  authorizationUrl.searchParams.set("state", state);

  return NextResponse.redirect(authorizationUrl);
}

function getRedirectUri(): string {
  if (process.env.AZURE_REDIRECT_URI) {
    return process.env.AZURE_REDIRECT_URI;
  }

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return `${baseUrl.replace(/\/$/, "")}/api/graph/auth/callback`;
}
