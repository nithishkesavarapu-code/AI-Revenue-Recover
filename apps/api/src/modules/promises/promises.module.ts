import { Module } from "@nestjs/common";
import { CasesModule } from "../cases/cases.module";
import { ToolsModule } from "../tools/tools.module";
import { VerificationModule } from "../verification/verification.module";
import { PromisesController, VoiceController } from "./promises.controller";
import { PromisesService } from "./promises.service";
import { VoiceService } from "./voice.service";

@Module({
  imports: [CasesModule, ToolsModule, VerificationModule],
  controllers: [PromisesController, VoiceController],
  providers: [PromisesService, VoiceService],
  exports: [PromisesService, VoiceService],
})
export class PromisesModule {}
