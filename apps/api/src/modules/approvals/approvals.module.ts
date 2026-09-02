import { Module } from "@nestjs/common";
import { CasesModule } from "../cases/cases.module";
import { ApprovalsController } from "./approvals.controller";
import { ApprovalsService } from "./approvals.service";

@Module({ imports: [CasesModule], controllers: [ApprovalsController], providers: [ApprovalsService] })
export class ApprovalsModule {}
