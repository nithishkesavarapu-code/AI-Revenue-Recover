import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ApprovalStatus, Prisma } from "@prisma/client";
import type { z } from "zod";
import { approvalRequestSchema, approvalReviewSchema } from "@revrec/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { CaseActionsService } from "../cases/cases-actions.service";

type ApprovalRequestInput = z.infer<typeof approvalRequestSchema>;
type ApprovalReviewInput = z.infer<typeof approvalReviewSchema>;

@Injectable()
export class ApprovalsService {
  constructor(private readonly prisma: PrismaService, private readonly actions: CaseActionsService) {}

  pending() {
    return this.prisma.approvalRequest.findMany({
      where: { status: ApprovalStatus.PENDING },
      orderBy: { createdAt: "asc" },
      include: { case: { include: { customer: { select: { name: true, email: true, riskScore: true } } } } },
    });
  }

  async request(caseId: number, input: ApprovalRequestInput) {
    const recoveryCase = await this.prisma.recoveryCase.findUnique({ where: { id: caseId }, include: { customer: true } });
    if (!recoveryCase) throw new NotFoundException(`Recovery case ${caseId} not found`);
    if (!this.needsApproval(Number(recoveryCase.amountAtRisk), recoveryCase.customer.riskScore)) {
      throw new BadRequestException("This case does not meet the high-value or high-risk approval threshold");
    }
    const existing = await this.prisma.approvalRequest.findFirst({ where: { caseId, status: ApprovalStatus.PENDING }, orderBy: { createdAt: "desc" } });
    if (existing) return existing;
    const approval = await this.prisma.approvalRequest.create({ data: { caseId, requestedAction: input.action, reason: input.reason, requestedBy: input.requestedBy ?? "recovery-agent" } });
    await this.audit(caseId, "APPROVAL_REQUESTED", `Approval requested for ${input.action}`, { approvalId: approval.id, ...input });
    return approval;
  }

  async approve(id: number, input: ApprovalReviewInput) {
    const approval = await this.prisma.approvalRequest.findUnique({ where: { id } });
    if (!approval) throw new NotFoundException(`Approval request ${id} not found`);
    if (approval.status !== ApprovalStatus.PENDING) throw new BadRequestException(`Approval request is already ${approval.status}`);
    const action = input.editedAction ?? approval.requestedAction;
    const execution = await this.actions.execute(approval.caseId, { action });
    const updated = await this.prisma.approvalRequest.update({
      where: { id },
      data: { status: ApprovalStatus.APPROVED, reviewedAction: action, reviewedBy: input.reviewedBy, reviewerNote: input.reviewerNote, reviewedAt: new Date() },
    });
    await this.audit(approval.caseId, "APPROVAL_APPROVED", `Approved ${action} by ${input.reviewedBy}`, { approvalId: id, action, reviewerNote: input.reviewerNote, execution });
    return { approval: updated, execution };
  }

  async reject(id: number, input: ApprovalReviewInput) {
    const approval = await this.prisma.approvalRequest.findUnique({ where: { id } });
    if (!approval) throw new NotFoundException(`Approval request ${id} not found`);
    if (approval.status !== ApprovalStatus.PENDING) throw new BadRequestException(`Approval request is already ${approval.status}`);
    const updated = await this.prisma.approvalRequest.update({
      where: { id },
      data: { status: ApprovalStatus.REJECTED, reviewedBy: input.reviewedBy, reviewerNote: input.reviewerNote, reviewedAt: new Date() },
    });
    await this.audit(approval.caseId, "APPROVAL_REJECTED", `Rejected by ${input.reviewedBy}`, { approvalId: id, reviewerNote: input.reviewerNote });
    return updated;
  }

  private needsApproval(amount: number, riskScore: number) {
    return amount >= 50_000 || riskScore >= 0.7;
  }

  private async audit(caseId: number, action: string, message: string, payload: Record<string, unknown>) {
    await this.prisma.caseEvent.create({ data: { caseId, type: action, message, metadata: payload as Prisma.InputJsonValue } });
    await this.prisma.auditLog.create({ data: { actor: "approval-queue", action, entityType: "recovery_case", entityId: String(caseId), payload: payload as Prisma.InputJsonValue } });
  }
}
