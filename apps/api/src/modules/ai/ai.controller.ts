import { BadRequestException, Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";

import {
  diagnoseCaseRequestSchema,
  diagnosePendingRequestSchema,
} from "@revrec/shared";
import { DiagnosisService } from "./diagnosis.service";
import { AI_PROVIDER } from "./ai-provider.interface";

@Controller("ai")
export class AiController {
  constructor(
    private readonly diagnosisService: DiagnosisService,
    @Inject(AI_PROVIDER) private readonly provider: { readonly name: string },
  ) {}


  @Get("provider")
  activeProvider() {
    return { active: this.provider.name };
  }

  /** Declared BEFORE :caseId so "pending" is never captured as an id. */
  @Post("diagnose/pending")
  diagnosePending(@Body() body: unknown) {
    const parsed = diagnosePendingRequestSchema.safeParse(body ?? {});
    const limit = parsed.success ? parsed.data.limit : 100;
    return this.diagnosisService.diagnosePending(limit);
  }

  @Post("diagnose/:caseId")
  diagnoseCase(
    @Param("caseId") caseId: string,
    @Body() body: unknown,
  ) {
    const id = Number(caseId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException(`Invalid case id: ${caseId}`);
    }
    const parsed = diagnoseCaseRequestSchema.safeParse(body ?? {});
    const force = parsed.success ? parsed.data.force : false;
    return this.diagnosisService.diagnoseCase(id, force);
  }
}

