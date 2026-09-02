import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import { recoverySequenceSweepRequestSchema } from "@revrec/shared";
import { SequencesService } from "./sequences.service";

@Controller("sequences")
export class SequencesController {
  constructor(private readonly sequences: SequencesService) {}

  @Get("config")
  config() {
    return { steps: this.sequences.getSteps() };
  }

  @Post("run/:caseId")
  run(@Param("caseId") caseId: string) {
    const id = Number(caseId);
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException(`Invalid case id: ${caseId}`);
    return this.sequences.runCase(id);
  }

  @Post("sweep")
  sweep(@Body() body: unknown) {
    const parsed = recoverySequenceSweepRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid sequence sweep request", issues: parsed.error.flatten() });
    }
    return this.sequences.sweep(parsed.data.limit);
  }
}
