import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { batchRecoveryRunRequestSchema } from "@revrec/shared";
import { AgentService } from "./agent.service";

@Controller("agent")
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  /**
   * Runs the bounded recovery agent over a batch of active cases and returns
   * measured recovery output for the run.
   */
  @Post("recover-batch")
  runBatch(@Body() body: unknown) {
    const parsed = batchRecoveryRunRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid request body",
        issues: parsed.error.flatten(),
      });
    }
    return this.agentService.runBatch(parsed.data);
  }
}
