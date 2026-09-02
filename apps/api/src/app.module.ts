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
import { EventsModule } from "./modules/events/events.module";
import { SequencesModule } from "./modules/sequences/sequences.module";
import { EmailModule } from "./modules/email/email.module";
import { ApprovalsModule } from "./modules/approvals/approvals.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";

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
    EventsModule,
    SequencesModule,
    EmailModule,
    ApprovalsModule,
    AnalyticsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
})
export class AppModule {}
