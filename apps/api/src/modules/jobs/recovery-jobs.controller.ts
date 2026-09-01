import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { batchRecoveryRunRequestSchema } from "@revrec/shared";
import { RecoveryJobsService } from "./recovery-jobs.service";

@Controller("jobs")
export class RecoveryJobsController {
  constructor(private readonly jobs: RecoveryJobsService) {}

  @Post("recover-batch")
  enqueueBatch(@Body() body: unknown) {
    const parsed = batchRecoveryRunRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid request body", issues: parsed.error.flatten() });
    }
    return this.jobs.enqueueBatch(parsed.data);
  }
}
