import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";

export async function GET() {
  return withUser(async (user) => {
    const connectedAccounts = await prisma.connectedAccount.findMany({ where: { userId: user.id } });
    return NextResponse.json({ ...user, connectedAccounts });
  });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  return withUser(async (user) => {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { tonePreference: body.tonePreference ?? undefined },
    });
    return NextResponse.json(updated);
  });
}
