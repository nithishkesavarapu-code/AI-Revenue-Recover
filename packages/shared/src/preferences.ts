import { z } from "zod";
import { CHANNELS } from "./enums";

export const contactPreferenceSchema = z.object({
  channel: z.enum(CHANNELS),
  status: z.enum(["OPTED_IN", "OPTED_OUT"]),
  source: z.string().trim().min(1).max(160).optional(),
});

export type ContactPreferenceInput = z.infer<typeof contactPreferenceSchema>;
