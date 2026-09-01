import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { RecoveryJobsController } from "./recovery-jobs.controller";
import { RecoveryJobsService } from "./recovery-jobs.service";

@Module({
  imports: [AgentModule],
  controllers: [RecoveryJobsController],
  providers: [RecoveryJobsService],
  exports: [RecoveryJobsService],
})
export class JobsModule {}
