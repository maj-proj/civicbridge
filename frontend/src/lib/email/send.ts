/**
 * Delivery layer, with three modes:
 *
 *   dry_run  composed and logged; nothing leaves the machine.
 *   sandbox  delivered to EMAIL_OVERRIDE_TO, with the genuine recipient
 *            preserved in the subject and in an injected header block.
 *   live     delivered to the real authority.
 *
 * `live` additionally requires EMAIL_ALLOW_LIVE=true. Two gates rather than
 * one is intentional: this system mails municipal officials an AI-drafted
 * complaint carrying a machine-assigned severity, and that should never
 * start happening because a single variable was changed by accident.
 */

export type EmailMode = "dry_run" | "sandbox" | "live";

export interface SendRequest {
  to: string;
  cc: string[];
  subject: string;
  body: string;
  bodyHtml?: string | null;
}

export interface SendOutcome {
  mode: EmailMode;
  status: "DRY_RUN" | "SENT" | "FAILED";
  /** Where it was really delivered — differs from `to` in sandbox mode. */
  actualTo: string;
  actualCc: string[];
  subject: string;
  body: string;
  bodyHtml?: string | null;
  providerMessageId?: string;
  error?: string;
}

export function resolveEmailMode(): EmailMode {
  const raw = (process.env.EMAIL_MODE || "dry_run").trim().toLowerCase();

  if (raw === "live") {
    if ((process.env.EMAIL_ALLOW_LIVE || "").trim().toLowerCase() !== "true") {
      console.warn(
        "EMAIL_MODE=live but EMAIL_ALLOW_LIVE is not 'true' — downgrading to sandbox."
      );
      return "sandbox";
    }
    return "live";
  }

  if (raw === "sandbox") return "sandbox";
  return "dry_run";
}

export function overrideAddress(): string | null {
  const value = (process.env.EMAIL_OVERRIDE_TO || "").trim();
  if (!value || value.includes("example.com")) return null;
  return value;
}

/**
 * Where a message would land if it were sent now, without sending it. The
 * approval screen uses this so the reporter can see that a notice addressed
 * to a government office will actually be redirected in sandbox mode.
 */
export function previewDelivery(intendedTo: string): {
  mode: EmailMode;
  deliverTo: string;
  redirected: boolean;
  blocker: string | null;
} {
  const mode = resolveEmailMode();

  if (mode === "dry_run") {
    return { mode, deliverTo: intendedTo, redirected: false, blocker: null };
  }

  const override = mode === "sandbox" ? overrideAddress() : null;

  if (mode === "sandbox" && !override) {
    return {
      mode,
      deliverTo: intendedTo,
      redirected: false,
      blocker: "EMAIL_MODE=sandbox requires a real EMAIL_OVERRIDE_TO address.",
    };
  }

  return {
    mode,
    deliverTo: override ?? intendedTo,
    redirected: Boolean(override),
    blocker: isResendConfigured()
      ? null
      : "RESEND_API_KEY is not configured; cannot deliver.",
  };
}

function isResendConfigured(): boolean {
  const key = process.env.RESEND_API_KEY;
  return Boolean(key && key.trim() && !key.toLowerCase().includes("your_"));
}

/** Prepends the real-recipient banner used in sandbox mode. */
function withRedirectionNotice(
  body: string,
  intendedTo: string,
  intendedCc: string[]
): string {
  const banner = [
    "=".repeat(68),
    "CIVICBRIDGE SANDBOX DELIVERY — this message was NOT sent to the authority.",
    `Intended recipient : ${intendedTo}`,
    intendedCc.length > 0 ? `Intended CC        : ${intendedCc.join(", ")}` : null,
    "=".repeat(68),
    "",
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return banner + body;
}

/** The same warning, injected at the top of the HTML part. */
function withRedirectionNoticeHtml(
  html: string,
  intendedTo: string,
  intendedCc: string[]
): string {
  const banner = `<div style="max-width:600px;margin:0 auto 12px;padding:12px 16px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;line-height:1.5;color:#991b1b;">
    <strong>CivicBridge sandbox delivery — this message was NOT sent to the authority.</strong><br />
    Intended recipient: ${intendedTo}${
      intendedCc.length > 0 ? `<br />Intended CC: ${intendedCc.join(", ")}` : ""
    }
  </div>`;

  // Slotted just inside <body> so the banner sits above the notice card.
  return html.includes("<body")
    ? html.replace(/(<body[^>]*>)/i, `$1${banner}`)
    : banner + html;
}

async function deliverViaResend(
  to: string,
  cc: string[],
  subject: string,
  body: string,
  bodyHtml?: string | null
): Promise<{ id: string }> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "CivicBridge <onboarding@resend.dev>",
      to: [to],
      ...(cc.length > 0 ? { cc } : {}),
      subject,
      // Both parts: the HTML renders the evidence, the text part keeps the
      // notice readable in clients that refuse to load images.
      text: body,
      ...(bodyHtml ? { html: bodyHtml } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend returned ${response.status}: ${detail}`);
  }

  const data = (await response.json()) as { id?: string };
  return { id: data.id ?? "unknown" };
}

export async function sendAuthorityEmail(
  request: SendRequest
): Promise<SendOutcome> {
  const mode = resolveEmailMode();

  const base = {
    mode,
    subject: request.subject,
    body: request.body,
  };

  if (mode === "dry_run") {
    console.info(
      `[email:dry_run] Would send "${request.subject}" to ${request.to}` +
        (request.cc.length > 0 ? ` (cc: ${request.cc.join(", ")})` : "")
    );
    return {
      ...base,
      status: "DRY_RUN",
      actualTo: request.to,
      actualCc: request.cc,
    };
  }

  // --- sandbox: redirect, preserving the real recipient in the record -----
  let deliverTo = request.to;
  let deliverCc = request.cc;
  let subject = request.subject;
  let body = request.body;
  let bodyHtml = request.bodyHtml ?? null;

  if (mode === "sandbox") {
    const override = overrideAddress();

    if (!override) {
      const error =
        "EMAIL_MODE=sandbox requires a real EMAIL_OVERRIDE_TO address.";
      console.warn(`[email:sandbox] ${error}`);
      return {
        ...base,
        status: "FAILED",
        actualTo: request.to,
        actualCc: request.cc,
        error,
      };
    }

    deliverTo = override;
    deliverCc = [];
    subject = `[SANDBOX -> ${request.to}] ${request.subject}`;
    body = withRedirectionNotice(request.body, request.to, request.cc);
    bodyHtml = bodyHtml
      ? withRedirectionNoticeHtml(bodyHtml, request.to, request.cc)
      : null;
  }

  if (!isResendConfigured()) {
    const error = "RESEND_API_KEY is not configured; cannot deliver.";
    console.warn(`[email:${mode}] ${error}`);
    return {
      ...base,
      status: "FAILED",
      actualTo: deliverTo,
      actualCc: deliverCc,
      subject,
      body,
      bodyHtml,
      error,
    };
  }

  try {
    const { id } = await deliverViaResend(
      deliverTo,
      deliverCc,
      subject,
      body,
      bodyHtml
    );
    return {
      ...base,
      status: "SENT",
      actualTo: deliverTo,
      actualCc: deliverCc,
      subject,
      body,
      bodyHtml,
      providerMessageId: id,
    };
  } catch (error) {
    return {
      ...base,
      status: "FAILED",
      actualTo: deliverTo,
      actualCc: deliverCc,
      subject,
      body,
      bodyHtml,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
