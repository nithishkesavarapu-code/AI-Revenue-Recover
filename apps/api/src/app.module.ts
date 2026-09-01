import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./modules/health/health.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { CasesModule } from "./modules/cases/cases.module";
import { SimulatorModule } from "./modules/simulator/simulator.module";
import { AiModule } from "./modules/ai/ai.module";
import { PolicyModule } from "./modules/policy/policy.module";
import { ToolsModule } from "./modules/tools/tools.module";
import { VerificationModule } from "./modules/verification/verification.module";
import { PromisesModule } from "./modules/promises/promises.module";
import { AgentModule } from "./modules/agent/agent.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { SecurityModule } from "./modules/security/security.module";
import { ApiKeyGuard } from "./modules/security/api-key.guard";
import { JobsModule } from "./modules/jobs/jobs.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    CustomersModule,
    CasesModule,
    SimulatorModule,
    AiModule,
    PolicyModule,
    ToolsModule,
    VerificationModule,
    PromisesModule,
    AgentModule,
    PaymentsModule,
    SecurityModule,
    JobsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
})
export class AppModule {}
