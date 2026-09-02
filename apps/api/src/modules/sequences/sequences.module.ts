import { Module } from "@nestjs/common";
import { CasesModule } from "../cases/cases.module";
import { SequencesController } from "./sequences.controller";
import { SequencesService } from "./sequences.service";

@Module({
  imports: [CasesModule],
  controllers: [SequencesController],
  providers: [SequencesService],
  exports: [SequencesService],
})
export class SequencesModule {}
