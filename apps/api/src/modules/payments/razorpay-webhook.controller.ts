import { Controller, Headers, Post, Req } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { RazorpayWebhookService } from "./razorpay-webhook.service";

@Controller("webhooks/razorpay")
export class RazorpayWebhookController {
  constructor(private readonly webhooks: RazorpayWebhookService) {}

  @Post()
  receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers("x-razorpay-signature") signature?: string,
  ) {
    return this.webhooks.receive(request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {})), signature);
  }
}
