import { z } from "zod";
import { RECOMMENDED_ACTIONS } from "./enums";

export const approvalRequestSchema = z.object({
  action: z.enum(RECOMMENDED_ACTIONS),
  reason: z.string().trim().min(5).max(500),
  requestedBy: z.string().trim().min(1).max(120).optional(),
});

export const approvalReviewSchema = z.object({
  reviewedBy: z.string().trim().min(1).max(120),
  reviewerNote: z.string().trim().max(500).optional(),
  editedAction: z.enum(RECOMMENDED_ACTIONS).optional(),
});
