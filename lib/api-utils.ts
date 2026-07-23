import { NextResponse } from "next/server";
import { UnauthorizedError, requireUser } from "@/lib/session";
import type { User } from "@prisma/client";

export async function withUser(
  handler: (user: User) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    return await handler(user);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
