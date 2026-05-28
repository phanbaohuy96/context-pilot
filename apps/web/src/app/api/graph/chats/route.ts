import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { DelegatedMicrosoftGraphClient } from "@context-pilot/graph";

const accessTokenCookie = "teams_graph_access_token";

export async function GET(): Promise<Response> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(accessTokenCookie)?.value;

  if (!accessToken) {
    return NextResponse.json({
      connected: false,
      chats: [],
      message: "Connect Teams to list available chats.",
    });
  }

  try {
    const graph = new DelegatedMicrosoftGraphClient(accessToken);
    const response = await graph.listChats();

    return NextResponse.json({
      connected: true,
      chats: response.value.map((chat) => ({
        id: chat.id,
        displayName: chat.topic || labelForChatType(chat.chatType),
        chatType: chat.chatType ?? "unknown",
        lastUpdatedDateTime: chat.lastUpdatedDateTime,
        webUrl: chat.webUrl,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        chats: [],
        message: error instanceof Error ? error.message : "Could not list Teams chats.",
      },
      { status: 502 },
    );
  }
}

function labelForChatType(chatType: string | null | undefined): string {
  if (chatType === "oneOnOne") {
    return "One-on-one chat";
  }

  if (chatType === "group") {
    return "Group chat";
  }

  if (chatType === "meeting") {
    return "Meeting chat";
  }

  return "Teams chat";
}
