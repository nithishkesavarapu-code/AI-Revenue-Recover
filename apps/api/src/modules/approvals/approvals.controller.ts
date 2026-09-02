import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import { approvalRequestSchema, approvalReviewSchema } from "@revrec/shared";
import { ApprovalsService } from "./approvals.service";

@Controller("approvals")
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get("pending")
  pending() { return this.approvals.pending(); }

  @Post("request/:caseId")
  request(@Param("caseId") caseId: string, @Body() body: unknown) {
    return this.approvals.request(this.caseId(caseId), this.parse(approvalRequestSchema, body));
  }

  @Post(":id/approve")
  approve(@Param("id") id: string, @Body() body: unknown) {
    return this.approvals.approve(this.approvalId(id), this.parse(approvalReviewSchema, body));
  }

  @Post(":id/reject")
  reject(@Param("id") id: string, @Body() body: unknown) {
    return this.approvals.reject(this.approvalId(id), this.parse(approvalReviewSchema, body));
  }

  private parse<T>(schema: { safeParse(value: unknown): { success: boolean; data?: T; error?: { flatten(): unknown } } }, body: unknown): T {
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success || parsed.data === undefined) throw new BadRequestException({ message: "Invalid approval request", issues: parsed.error?.flatten() });
    return parsed.data;
  }

  private caseId(value: string) { return this.id(value, "case"); }
  private approvalId(value: string) { return this.id(value, "approval"); }
  private id(value: string, label: string) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException(`Invalid ${label} id: ${value}`);
    return id;
  }
}
