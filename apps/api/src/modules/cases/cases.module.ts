import { Module } from "@nestjs/common";
import { PolicyModule } from "../policy/policy.module";
import { ToolsModule } from "../tools/tools.module";
import { CaseActionsService } from "./cases-actions.service";

import { CasesController } from "./cases.controller";
import { CasesService } from "./cases.service";

@Module({
  imports: [PolicyModule, ToolsModule],
  controllers: [CasesController],
  providers: [CasesService, CaseActionsService],
  exports: [CasesService, CaseActionsService],
})
export class CasesModule {}

