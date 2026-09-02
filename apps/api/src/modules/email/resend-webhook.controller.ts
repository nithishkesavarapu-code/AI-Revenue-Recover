import { Controller, Headers, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { ResendWebhookService } from "./resend-webhook.service";

@Controller("webhooks/resend")
export class ResendWebhookController {
  constructor(private readonly webhooks: ResendWebhookService) {}

  @Post()
  receive(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers("svix-id") id?: string,
    @Headers("svix-timestamp") timestamp?: string,
    @Headers("svix-signature") signature?: string,
  ) {
    return this.webhooks.receive(request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {})), {
      id,
      timestamp,
      signature,
    });
  }
}
