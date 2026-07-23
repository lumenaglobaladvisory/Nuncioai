import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";

export async function GET(req: Request) {
  return withUser(async (user) => {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope");
    const entries = await prisma.memoryEntry.findMany({
      where: { userId: user.id, ...(scope ? { scope } : {}) },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(entries);
  });
}

interface UpsertMemoryBody {
  scope: "global" | "recipient" | "client";
  key: string;
  data: string;
}

export async function POST(req: Request) {
  const body = (await req.json()) as UpsertMemoryBody;
  return withUser(async (user) => {
    if (!body.scope || !body.key || body.data === undefined) {
      return NextResponse.json({ error: "scope, key, and data are required" }, { status: 400 });
    }
    const entry = await prisma.memoryEntry.upsert({
      where: { userId_scope_key: { userId: user.id, scope: body.scope, key: body.key } },
      create: { userId: user.id, scope: body.scope, key: body.key, data: body.data },
      update: { data: body.data },
    });
    return NextResponse.json(entry, { status: 201 });
  });
}
