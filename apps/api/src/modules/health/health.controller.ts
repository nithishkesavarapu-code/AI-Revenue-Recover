import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@revrec/shared";

@Controller("health")
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: "ok",
      service: "ai-revenue-recovery-api",
      time: new Date().toISOString(),
    };
  }
}
