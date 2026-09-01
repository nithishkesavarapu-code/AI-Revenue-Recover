import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { VerificationService } from "../verification/verification.service";
import { RazorpayService } from "./razorpay.service";

type RazorpayPayload = {
  event?: string;
  payload?: {
    payment_link?: { entity?: { id?: string; status?: string } };
    order?: { entity?: { id?: string; status?: string } };
    payment?: { entity?: { id?: string } };
  };
};

@Injectable()
export class RazorpayWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService,
    private readonly verification: VerificationService,
  ) {}

  async receive(rawBody: Buffer, signature?: string) {
    if (!this.razorpay.isEnabled()) {
      throw new BadRequestException("Razorpay webhooks are disabled while PAYMENT_PROVIDER is not razorpay");
    }
    if (!this.razorpay.verifyWebhookSignature(rawBody, signature)) {
      throw new UnauthorizedException("Invalid Razorpay webhook signature");
    }

    const payload = JSON.parse(rawBody.toString("utf8")) as RazorpayPayload;
    const eventType = payload.event ?? "unknown";
    // Razorpay retries use the same signed body. Its SHA-256 digest is a stable idempotency key.
    const eventId = createHash("sha256").update(rawBody).digest("hex");
    const existing = await this.prisma.providerWebhookEvent.findUnique({
      where: { provider_eventId: { provider: "razorpay", eventId } },
    });
    if (existing?.processedAt) return { accepted: true, duplicate: true };

    const event = existing ?? await this.prisma.providerWebhookEvent.create({
      data: { provider: "razorpay", eventId, eventType, payload: payload as object },
    });

    try {
      if (eventType === "payment_link.paid") {
        // Razorpay's Payment Link webhook examples expose the plink_ id through
        // payload.order.entity, while other payload versions use payment_link.
        const providerLinkId =
          payload.payload?.payment_link?.entity?.id ?? payload.payload?.order?.entity?.id;
        const paymentId = payload.payload?.payment?.entity?.id;
        if (!providerLinkId || !paymentId) throw new BadRequestException("Invalid payment_link.paid payload");
        const link = await this.prisma.paymentLink.findUnique({ where: { providerLinkId } });
        if (!link) throw new BadRequestException("Payment link is not known to this recovery system");

        const caseRecord = await this.prisma.recoveryCase.findUniqueOrThrow({
          where: { id: link.caseId },
          select: { status: true },
        });
        if (caseRecord.status !== "RECOVERED") {
          await this.verification.verifyProviderPayment(link.caseId, paymentId);
        }
        await this.prisma.paymentLink.update({ where: { id: link.id }, data: { status: "paid" } });
      }

      await this.prisma.providerWebhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date(), failure: null },
      });
      return { accepted: true, duplicate: false };
    } catch (error) {
      await this.prisma.providerWebhookEvent.update({
        where: { id: event.id },
        data: { failure: (error instanceof Error ? error.message : String(error)).slice(0, 500) },
      });
      // A non-2xx response tells Razorpay to retry the signed event.
      throw error;
    }
  }
}
