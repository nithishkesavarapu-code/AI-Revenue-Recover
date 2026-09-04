import { Module } from "@nestjs/common";
import { ToolsService } from "./simulated-tools.service";
import { PaymentsModule } from "../payments/payments.module";
import { EmailModule } from "../email/email.module";
import { OutboxModule } from "../outbox/outbox.module";

@Module({
  imports: [PaymentsModule, EmailModule, OutboxModule],
  providers: [ToolsService],
  exports: [ToolsService],
})
export class ToolsModule {}
