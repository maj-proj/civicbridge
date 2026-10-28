/**
 * The approval gate for authority notices.
 *
 *   POST ?action=prepare  resolve the authority and draft the notice
 *   POST ?action=send     deliver the draft the reporter approved
 *
 * Sending is a separate, explicit call because this system mails municipal
 * officials an AI-drafted complaint carrying a machine-assigned severity. The
 * text that goes out is read back from the stored draft, never accepted from
 * the request body, so the approval screen and the delivered message cannot
 * diverge.
 */

import { NextRequest, NextResponse } from "next/server";
import { prepareReportEmail, sendPreparedEmail } from "@/lib/email/dispatch";
import { clientIdentifier, pruneRateLimitWindows, rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SEND_LIMIT_MAX = 10;
const SEND_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const action = req.nextUrl.searchParams.get("action");

  if (action !== "prepare" && action !== "send") {
    return NextResponse.json(
      { error: 'Expected ?action=prepare or ?action=send.' },
      { status: 400 }
    );
  }

  pruneRateLimitWindows();
  const limit = rateLimit(
    `email:${clientIdentifier(req)}`,
    SEND_LIMIT_MAX,
    SEND_LIMIT_WINDOW_MS
  );

  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "Too many notice requests. Please wait before trying again.",
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  if (action === "prepare") {
    const result = await prepareReportEmail(id);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json({ success: true, draft: result.draft });
  }

  const body = await req.json().catch(() => ({}) as { draftId?: string });
  const result = await sendPreparedEmail(id, body?.draftId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ success: true, delivery: result });
}
