import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { OperationsModule } from "../operations/operations.module";
import { OutboxModule } from "../outbox/outbox.module";
import { RecoveryJobsController } from "./recovery-jobs.controller";
import { RecoveryJobsService } from "./recovery-jobs.service";

@Module({
  imports: [AgentModule, OutboxModule, OperationsModule],
  controllers: [RecoveryJobsController],
  providers: [RecoveryJobsService],
  exports: [RecoveryJobsService],
})
export class JobsModule {}
