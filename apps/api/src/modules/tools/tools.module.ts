import { Module } from "@nestjs/common";
import { ToolsService } from "./simulated-tools.service";
import { PaymentsModule } from "../payments/payments.module";

@Module({
  imports: [PaymentsModule],
  providers: [ToolsService],
  exports: [ToolsService],
})
export class ToolsModule {}
