import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { revenueEventSchema } from "@revrec/shared";
import { EventsService } from "./events.service";

@Controller("events")
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post("revenue")
  receive(@Body() body: unknown) {
    const parsed = revenueEventSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid revenue event",
        issues: parsed.error.flatten(),
      });
    }
    return this.events.receive(parsed.data);
  }
}
