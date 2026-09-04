import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import {
  batchVerifyRequestSchema,
  simulateCustomerRequestSchema,
} from "@revrec/shared";
import { VerificationService } from "./verification.service";

@Controller("verification")
export class VerificationController {
  constructor(
    private readonly verificationService: VerificationService,
    private readonly config: ConfigService,
  ) {}

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
    this.requireSimulationAccess(body);
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
    this.requireSimulationAccess(body);
    const parsed = batchVerifyRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid request body", issues: parsed.error.flatten() });
    }
    return this.verificationService.simulateBatch(parsed.data.successRatePct, parsed.data.limit);
  }

  private requireSimulationAccess(body: unknown) {
    if (this.config.get("ALLOW_SIMULATED_VERIFICATION") !== "true") {
      throw new ForbiddenException("Simulated verification is disabled. Use a signed payment-provider webhook for real recovery.");
    }
    const expected = this.config.get<string>("DEMO_ACCESS_TOKEN");
    const provided = typeof body === "object" && body !== null && "demoAccessToken" in body
      ? (body as { demoAccessToken?: unknown }).demoAccessToken
      : undefined;
    if (!expected || typeof provided !== "string") {
      throw new ForbiddenException("A valid demo access token is required for simulated verification.");
    }
    const expectedBytes = Buffer.from(expected);
    const receivedBytes = Buffer.from(provided);
    if (expectedBytes.length !== receivedBytes.length || !timingSafeEqual(expectedBytes, receivedBytes)) {
      throw new ForbiddenException("A valid demo access token is required for simulated verification.");
    }
  }
}
