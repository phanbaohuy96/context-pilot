import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@context-pilot/db";

const updateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["NEW", "CONFIRMED", "REJECTED"]),
});

export async function PATCH(request: Request): Promise<Response> {
  const input = updateSchema.parse(await request.json());
  const requirement = await prisma.requirement.update({
    where: { id: input.id },
    data: { status: input.status },
  });

  return NextResponse.json({ requirement });
}
