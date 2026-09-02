import { Module } from "@nestjs/common";
import { ResendEmailService } from "./resend-email.service";
import { ResendWebhookController } from "./resend-webhook.controller";
import { ResendWebhookService } from "./resend-webhook.service";

@Module({
  controllers: [ResendWebhookController],
  providers: [ResendEmailService, ResendWebhookService],
  exports: [ResendEmailService],
})
export class EmailModule {}
