import { Module } from "@nestjs/common";
import { RazorpayService } from "./razorpay.service";
import { VerificationModule } from "../verification/verification.module";
import { RazorpayWebhookController } from "./razorpay-webhook.controller";
import { RazorpayWebhookService } from "./razorpay-webhook.service";

@Module({
  imports: [VerificationModule],
  controllers: [RazorpayWebhookController],
  providers: [RazorpayService, RazorpayWebhookService],
  exports: [RazorpayService],
})
export class PaymentsModule {}
