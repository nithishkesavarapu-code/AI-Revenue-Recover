import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  batchVerifyRequestSchema,
  simulateCustomerRequestSchema,
} from "@revrec/shared";
import { VerificationService } from "./verification.service";

@Controller("verification")
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Get("pending")
  pending() {
    return this.verificationService.pending();
  }

  /** Simulate the customer honoring (or not) a link / scheduled retry. */
  @Post("customer/:caseId")
  simulateCustomer(
    @Param("caseId") caseId: string,
    @Body() body: unknown,
  ) {
    const id = Number(caseId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException(`Invalid case id: ${caseId}`);
    }
    const parsed = simulateCustomerRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid request body", issues: parsed.error.flatten() });
    }
    return this.verificationService.simulateCustomer(id, parsed.data.outcome, parsed.data.failureReason);
  }

  /** Mass-simulate customer responses across all verifiable cases. */
  @Post("batch")
  simulateBatch(@Body() body: unknown) {
    const parsed = batchVerifyRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid request body", issues: parsed.error.flatten() });
    }
    return this.verificationService.simulateBatch(parsed.data.successRatePct, parsed.data.limit);
  }
}
