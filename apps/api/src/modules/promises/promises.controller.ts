import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  settlePtpRequestSchema,
  voiceCallRequestSchema,
} from "@revrec/shared";
import { PromisesService } from "./promises.service";
import { VoiceService } from "./voice.service";

@Controller("ptp")
export class PromisesController {
  constructor(
    private readonly promisesService: PromisesService,
    private readonly voiceService: VoiceService,
  ) {}

  @Get()
  list() {
    return this.promisesService.list();
  }

  /** Guide §4.7 sweep — process promises past their promised date. */
  @Post("sweep")
  sweep() {
    return this.promisesService.sweep();
  }

  @Post(":id/settle")
  settle(
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const pid = Number(id);
    if (!Number.isInteger(pid) || pid <= 0) {
      throw new BadRequestException(`Invalid promise id: ${id}`);
    }
    const parsed = settlePtpRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid body", issues: parsed.error.flatten() });
    }
    return this.promisesService.settle(pid, parsed.data.outcome);
  }
}

@Controller("voice")
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  /** Simulated Hinglish voice call — STT + intent + bounded routing. */
  @Post("simulate-call/:caseId")
  simulateCall(
    @Param("caseId") caseId: string,
    @Body() body: unknown,
  ) {
    const cid = Number(caseId);
    if (!Number.isInteger(cid) || cid <= 0) {
      throw new BadRequestException(`Invalid case id: ${caseId}`);
    }
    const parsed = voiceCallRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid body", issues: parsed.error.flatten() });
    }
    return this.voiceService.simulateCall(cid, parsed.data.transcript);
  }
}
