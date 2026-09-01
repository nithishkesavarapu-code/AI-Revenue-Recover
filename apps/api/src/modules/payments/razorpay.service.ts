import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";

type RazorpayPaymentLinkResponse = { id: string; short_url: string; status: string };

@Injectable()
export class RazorpayService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  isEnabled() {
    return this.config.get("PAYMENT_PROVIDER") === "razorpay";
  }

  async createPaymentLink(input: {
    caseId: number;
    amount: number;
    currency: string;
    customerName: string;
    email: string;
    phone?: string | null;
    updateMethod: boolean;
  }) {
    const keyId = this.required("RAZORPAY_KEY_ID");
    const keySecret = this.required("RAZORPAY_KEY_SECRET");
    const referenceId = `recovery-${input.caseId}-${Date.now().toString(36)}`;
    const response = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(input.amount * 100),
        currency: input.currency,
        reference_id: referenceId,
        description: input.updateMethod ? "Update payment method" : "Complete pending payment",
        // Email is sufficient for this app's link flow. Do not pass formatted
        // seed phone numbers to Razorpay when SMS delivery is disabled.
        customer: { name: input.customerName, email: input.email },
        // Delivery remains opt-in until the business has configured consent and templates.
        notify: { email: this.config.get("RECOVERY_SEND_LIVE_MESSAGES") === "true", sms: false },
        notes: { recovery_case_id: String(input.caseId) },
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      let providerMessage = "Unknown Razorpay error";
      try {
        const parsed = JSON.parse(body) as { error?: { description?: string } };
        providerMessage = parsed.error?.description ?? providerMessage;
      } catch {
        // Keep a safe generic error when the provider response is not JSON.
      }
      throw new ServiceUnavailableException(
        `Razorpay payment-link request failed (${response.status}): ${providerMessage}`,
      );
    }
    const link = (await response.json()) as RazorpayPaymentLinkResponse;
    await this.prisma.paymentLink.create({
      data: {
        caseId: input.caseId,
        provider: "razorpay",
        providerLinkId: link.id,
        referenceId,
        shortUrl: link.short_url,
        status: link.status,
      },
    });
    return link;
  }

  verifyWebhookSignature(rawBody: Buffer, signature?: string) {
    const secret = this.required("RAZORPAY_WEBHOOK_SECRET");
    if (!signature) return false;
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const received = Buffer.from(signature, "utf8");
    const target = Buffer.from(expected, "utf8");
    return received.length === target.length && timingSafeEqual(received, target);
  }

  private required(name: string) {
    const value = this.config.get<string>(name);
    if (!value) throw new ServiceUnavailableException(`${name} must be configured for Razorpay live mode`);
    return value;
  }
}
