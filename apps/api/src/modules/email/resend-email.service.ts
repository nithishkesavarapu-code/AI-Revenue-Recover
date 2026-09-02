import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type RecoveryEmailInput = {
  contactAttemptId: number;
  customerName: string;
  customerEmail: string;
  company?: string | null;
  amount: number;
  currency: string;
  paymentLink?: string;
  kind: "PAYMENT_LINK" | "REMINDER";
};

type ResendResponse = { id?: string; message?: string };

@Injectable()
export class ResendEmailService {
  constructor(private readonly config: ConfigService) {}

  isLiveDeliveryEnabled() {
    return (
      this.config.get("EMAIL_PROVIDER") === "resend" &&
      this.config.get("RECOVERY_SEND_LIVE_MESSAGES") === "true"
    );
  }

  async sendRecoveryEmail(input: RecoveryEmailInput) {
    const apiKey = this.required("RESEND_API_KEY");
    const from = this.required("EMAIL_FROM");
    const amount = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: input.currency,
      maximumFractionDigits: 0,
    }).format(input.amount);
    const greeting = `Hello ${input.customerName},`;
    const subject = input.kind === "PAYMENT_LINK" ? `Complete your pending payment of ${amount}` : `Reminder: pending payment of ${amount}`;
    const action = input.paymentLink
      ? `<p><a href="${this.escapeAttribute(input.paymentLink)}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600">Complete payment</a></p>`
      : "";
    const html = `<p>${this.escapeHtml(greeting)}</p><p>${this.escapeHtml(
      `A payment of ${amount} is pending with ${input.company ?? "our billing team"}.`,
    )}</p>${action}<p>If you have already paid or need help, please reply to this email.</p>`;
    const text = `${greeting}\n\nA payment of ${amount} is pending with ${input.company ?? "our billing team"}.${input.paymentLink ? `\n\nComplete payment: ${input.paymentLink}` : ""}\n\nIf you have already paid or need help, reply to this email.`;
    const replyTo = this.replyTo(input.contactAttemptId);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [input.customerEmail],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
        tags: [
          { name: "recovery_contact_attempt_id", value: String(input.contactAttemptId) },
          { name: "recovery_email_kind", value: input.kind.toLowerCase() },
        ],
      }),
    });
    const body = (await response.json().catch(() => ({}))) as ResendResponse;
    if (!response.ok || !body.id) {
      throw new ServiceUnavailableException(`Resend email request failed (${response.status}): ${body.message ?? "unknown error"}`);
    }
    return { provider: "resend", providerMessageId: body.id, subject };
  }

  private replyTo(contactAttemptId: number) {
    const domain = this.config.get<string>("RESEND_REPLY_TO_DOMAIN");
    return domain ? `replies+${contactAttemptId}@${domain}` : undefined;
  }

  private required(name: "RESEND_API_KEY" | "EMAIL_FROM") {
    const value = this.config.get<string>(name);
    if (!value) throw new ServiceUnavailableException(`${name} must be configured for Resend delivery`);
    return value;
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
  }

  private escapeAttribute(value: string) {
    return this.escapeHtml(value);
  }
}
