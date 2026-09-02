import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import type { HealthResponse } from "@revrec/shared";
import { PrismaService } from "../../prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: "ok",
        service: "ai-revenue-recovery-api",
        time: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException("Database is unavailable");
    }
  }
}
