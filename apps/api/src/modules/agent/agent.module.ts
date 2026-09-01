import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { CasesModule } from "../cases/cases.module";
import { PromisesModule } from "../promises/promises.module";
import { SimulatorModule } from "../simulator/simulator.module";
import { VerificationModule } from "../verification/verification.module";
import { AgentController } from "./agent.controller";
import { AgentService } from "./agent.service";

@Module({
  imports: [AiModule, CasesModule, PromisesModule, SimulatorModule, VerificationModule],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
