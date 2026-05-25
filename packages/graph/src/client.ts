export type MicrosoftGraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
};

export type CreateSubscriptionInput = {
  resource: string;
  notificationUrl: string;
  clientState: string;
  expirationDateTime: Date;
  changeType?: string;
};

export type GraphSubscriptionResponse = {
  id: string;
  resource: string;
  changeType: string;
  notificationUrl: string;
  expirationDateTime: string;
};

export type GraphListResponse<T> = {
  value: T[];
  "@odata.nextLink"?: string;
};

export type GraphChat = {
  id: string;
  topic?: string | null;
  chatType?: string | null;
  lastUpdatedDateTime?: string | null;
  webUrl?: string | null;
};

type TokenResponse = {
  access_token: string;
  expires_in: number;
};

export class MicrosoftGraphClient {
  private readonly baseUrl: string;
  private token?: { value: string; expiresAt: number };

  constructor(private readonly config: MicrosoftGraphConfig) {
    this.baseUrl = config.baseUrl ?? "https://graph.microsoft.com/v1.0";
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<GraphSubscriptionResponse> {
    return this.request<GraphSubscriptionResponse>("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        changeType: input.changeType ?? "created,updated",
        notificationUrl: input.notificationUrl,
        resource: input.resource,
        expirationDateTime: input.expirationDateTime.toISOString(),
        clientState: input.clientState,
      }),
    });
  }

  async renewSubscription(subscriptionId: string, expirationDateTime: Date): Promise<GraphSubscriptionResponse> {
    return this.request<GraphSubscriptionResponse>(`/subscriptions/${subscriptionId}`, {
      method: "PATCH",
      body: JSON.stringify({
        expirationDateTime: expirationDateTime.toISOString(),
      }),
    });
  }

  async deleteSubscription(subscriptionId: string): Promise<void> {
    await this.request(`/subscriptions/${subscriptionId}`, { method: "DELETE" });
  }

  async getChannelMessage(input: {
    teamId: string;
    channelId: string;
    messageId: string;
  }): Promise<unknown> {
    return this.request(
      `/teams/${encodeURIComponent(input.teamId)}/channels/${encodeURIComponent(input.channelId)}/messages/${encodeURIComponent(input.messageId)}`,
    );
  }

  async getChatMessage(input: { chatId: string; messageId: string }): Promise<unknown> {
    return this.request(
      `/chats/${encodeURIComponent(input.chatId)}/messages/${encodeURIComponent(input.messageId)}`,
    );
  }

  async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Microsoft Graph request failed: ${response.status} ${body}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.token && this.token.expiresAt > now + 60_000) {
      return this.token.value;
    }

    const form = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    });

    const response = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(this.config.tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Microsoft identity token request failed: ${response.status} ${body}`);
    }

    const data = (await response.json()) as TokenResponse;
    this.token = {
      value: data.access_token,
      expiresAt: now + data.expires_in * 1000,
    };

    return this.token.value;
  }
}

export class DelegatedMicrosoftGraphClient {
  private readonly baseUrl: string;

  constructor(
    private readonly accessToken: string,
    baseUrl = "https://graph.microsoft.com/v1.0",
  ) {
    this.baseUrl = baseUrl;
  }

  async listChats(): Promise<GraphListResponse<GraphChat>> {
    return this.request<GraphListResponse<GraphChat>>("/me/chats?$top=50");
  }

  async listChatMessages(chatId: string, top = 50): Promise<GraphListResponse<unknown>> {
    return this.request<GraphListResponse<unknown>>(
      `/chats/${encodeURIComponent(chatId)}/messages?$top=${top}`,
    );
  }

  async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Microsoft Graph delegated request failed: ${response.status} ${body}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}
