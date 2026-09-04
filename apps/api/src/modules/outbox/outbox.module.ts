import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { OutboxService } from "./outbox.service";

@Module({ imports: [EmailModule], providers: [OutboxService], exports: [OutboxService] })
export class OutboxModule {}
