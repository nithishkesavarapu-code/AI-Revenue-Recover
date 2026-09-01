import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import { evaluateActionRequestSchema } from "@revrec/shared";
import { PolicyEngineService } from "./policy-engine.service";

@Controller("policy")
export class PolicyController {
  constructor(private readonly policyEngine: PolicyEngineService) {}

  @Get("config")
  config() {
    return {
      ...this.policyEngine.getConfig(),
      note: "Limits are enforced before any tool execution; the AI recommendation alone can never exceed them.",
    };
  }

  /** Dry-run verdict for a case's recommended (or explicitly provided) action. Nothing is executed. */
  @Post("evaluate/:caseId")
  evaluate(
    @Param("caseId") caseId: string,
    @Body() body: unknown,
  ) {
    const id = Number(caseId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException(`Invalid case id: ${caseId}`);
    }
    const parsed = evaluateActionRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid request body", issues: parsed.error.flatten() });
    }
    return this.policyEngine.evaluateWithOverride(id, parsed.data.action);
  }
}

