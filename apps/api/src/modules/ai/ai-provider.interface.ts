import type { AiDecision, DiagnosisInput } from "@revrec/shared";

/** DI token for the active AI diagnosis provider. */
export const AI_PROVIDER = "AI_PROVIDER";

/**
 * Boundary between the agent and any LLM (guide §24: "AI provides reasoning;
 * policy controls what is allowed"). Implementations MUST return a
 * schema-valid `AiDecision` — invalid output never reaches the policy engine.
 */
export interface AiDiagnosisProvider {
  /** Short identifier stored on every AiDecision row. */
  readonly name: string;

  diagnose(input: DiagnosisInput): Promise<AiDecision>;
}

