import { NextRequest, NextResponse } from "next/server";
import { graphNotificationEnvelopeSchema, validateClientState } from "@context-pilot/core";
import { getGraphNotificationsQueue } from "../../../../lib/queues";

export async function GET(request: NextRequest): Promise<Response> {
  return handleValidationChallenge(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  const validationResponse = handleValidationChallenge(request);
  if (validationResponse.status === 200) {
    return validationResponse;
  }

  const json = await request.json();
  const envelope = graphNotificationEnvelopeSchema.parse(json);
  const expectedClientState = process.env.GRAPH_CLIENT_STATE ?? "";
  const queue = getGraphNotificationsQueue();

  for (const notification of envelope.value) {
    if (!validateClientState(notification.clientState, expectedClientState)) {
      continue;
    }

    await queue.add("process", {
      subscriptionId: notification.subscriptionId,
      changeType: notification.changeType,
      resource: notification.resource,
      clientState: notification.clientState,
      tenantId: notification.tenantId,
      resourceDataId: notification.resourceData?.id,
    });
  }

  return NextResponse.json({ accepted: true });
}

function handleValidationChallenge(request: NextRequest): Response {
  const validationToken = request.nextUrl.searchParams.get("validationToken");

  if (!validationToken) {
    return new Response(null, { status: 404 });
  }

  return new Response(validationToken, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}
