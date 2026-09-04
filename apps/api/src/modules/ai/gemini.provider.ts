import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { aiDecisionSchema, type AiDecision, type DiagnosisInput } from "@revrec/shared";
import { buildDiagnosisPrompt, geminiResponseSchema } from "./gemini-prompt";
import type { AiDiagnosisProvider } from "./ai-provider.interface";

/**
 * Real Gemini implementation. Activated automatically when GEMINI_API_KEY
 * is present (see AiModule factory). Output is forced into our Zod-validated
 * JSON shape via Gemini's structured-output responseSchema.
 */
@Injectable()
export class GeminiProvider implements AiDiagnosisProvider {
  readonly name = "gemini";
  private readonly logger = new Logger(GeminiProvider.name);

  constructor(private readonly config: ConfigService) {}

  async diagnose(input: DiagnosisInput): Promise<AiDecision> {
    const apiKey = this.config.get<string>("GEMINI_API_KEY");
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }
    const model = this.config.get<string>("GEMINI_MODEL") ?? "gemini-3.7-flash";

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildDiagnosisPrompt(input) }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: geminiResponseSchema,
          },
        }),
      },
    );

    if (!res.ok) {
      const providerBody = (await res.text()).slice(0, 1_000);
      this.logger.error(`Gemini diagnosis request failed (${res.status}): ${providerBody}`);
      throw new ServiceUnavailableException(this.failureMessage(res.status));
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini returned no structured content");
    }

    // Schema-validating parse — invalid LLM output is rejected here.
    return aiDecisionSchema.parse(JSON.parse(text));
  }

  private failureMessage(status: number) {
    if (status === 401 || status === 403) {
      return `Gemini diagnosis was rejected (${status}). Check GEMINI_API_KEY and its Google AI Studio permissions.`;
    }
    if (status === 404) {
      return `Gemini model was not found (${status}). Check GEMINI_MODEL in the API service.`;
    }
    if (status === 429) {
      return "Gemini quota is currently exhausted. Wait for quota to reset or use a key with available quota.";
    }
    return `Gemini diagnosis is temporarily unavailable (${status}). Check the API deployment logs for the provider response.`;
  }
}
