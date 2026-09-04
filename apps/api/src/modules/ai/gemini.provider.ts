import { Injectable } from "@nestjs/common";
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
      throw new Error(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
}
