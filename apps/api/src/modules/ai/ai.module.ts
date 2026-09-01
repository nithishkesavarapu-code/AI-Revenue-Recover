import { Module, type Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GeminiProvider } from "./gemini.provider";
import { MockGeminiProvider } from "./mock-gemini.provider";
import { AI_PROVIDER, type AiDiagnosisProvider } from "./ai-provider.interface";
import { DiagnosisService } from "./diagnosis.service";
import { AiController } from "./ai.controller";

const providerFactory: Provider = {
  provide: AI_PROVIDER,
  inject: [MockGeminiProvider, GeminiProvider, ConfigService],
  useFactory: (mock: AiDiagnosisProvider, gemini: AiDiagnosisProvider, config: ConfigService) => {
    // Real Gemini as soon as a key is configured; mock otherwise.
    return config.get<string>("GEMINI_API_KEY") ? gemini : mock;
  },
};

@Module({
  controllers: [AiController],
  providers: [MockGeminiProvider, GeminiProvider, providerFactory, DiagnosisService],
  exports: [DiagnosisService],
})
export class AiModule {}

