import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const oauthStateCookie = "teams_graph_oauth_state";
const accessTokenCookie = "teams_graph_access_token";

type TokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

export async function GET(request: NextRequest): Promise<Response> {
  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    const description = request.nextUrl.searchParams.get("error_description") ?? error;
    return redirectToSources(`teamsError=${encodeURIComponent(description)}`);
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(oauthStateCookie)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToSources("teamsError=invalid_oauth_state");
  }

  const token = await exchangeCodeForToken(code);
  cookieStore.set(accessTokenCookie, token.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(token.expires_in - 60, 60),
  });
  cookieStore.delete(oauthStateCookie);

  return redirectToSources("teamsConnected=1");
}

async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const tenantId = requiredEnv("AZURE_TENANT_ID");
  const clientId = requiredEnv("AZURE_CLIENT_ID");
  const form = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
    scope: process.env.GRAPH_DELEGATED_SCOPES ?? "User.Read Chat.ReadBasic Chat.Read",
  });

  if (process.env.AZURE_CLIENT_SECRET) {
    form.set("client_secret", process.env.AZURE_CLIENT_SECRET);
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Microsoft token exchange failed: ${response.status} ${body}`);
  }

  return (await response.json()) as TokenResponse;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getRedirectUri(): string {
  if (process.env.AZURE_REDIRECT_URI) {
    return process.env.AZURE_REDIRECT_URI;
  }

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return `${baseUrl.replace(/\/$/, "")}/api/graph/auth/callback`;
}

function redirectToSources(query: string): Response {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return NextResponse.redirect(`${baseUrl.replace(/\/$/, "")}/sources?${query}`);
}
