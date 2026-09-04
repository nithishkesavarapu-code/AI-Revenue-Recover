import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import type { BatchRecoveryRunRequest } from "@revrec/shared";
import { AgentService } from "../agent/agent.service";
import { OperationsService } from "../operations/operations.service";
import { OutboxService } from "../outbox/outbox.service";

const QUEUE_NAME = "recovery-workflows";

@Injectable()
export class RecoveryJobsService implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue<BatchRecoveryRunRequest>;
  private worker?: Worker<BatchRecoveryRunRequest>;
  private maintenanceTimer?: NodeJS.Timeout;

  constructor(private readonly config: ConfigService, private readonly agent: AgentService, private readonly outbox: OutboxService, private readonly operations: OperationsService) {}

  enabled() {
    return this.config.get("BACKGROUND_JOBS_ENABLED") === "true";
  }

  async onModuleInit() {
    if (!this.enabled()) return;
    const connection = this.redisConnection();
    this.queue = new Queue<BatchRecoveryRunRequest>(QUEUE_NAME, { connection });
    this.worker = new Worker<BatchRecoveryRunRequest>(
      QUEUE_NAME,
      async (job) => this.agent.runBatch(job.data),
      { connection, concurrency: 2 },
    );
    this.maintenanceTimer = setInterval(() => void this.runMaintenance(), 60_000);
    void this.runMaintenance();
  }

  async enqueueBatch(input: BatchRecoveryRunRequest) {
    if (!this.queue) return { accepted: false, status: "disabled" as const };
    const job = await this.queue.add("recover-batch", input, {
      attempts: 5,
      backoff: { type: "exponential", delay: 1_000 },
      removeOnComplete: 500,
      removeOnFail: 1_000,
    });
    return { accepted: true, jobId: job.id, status: "queued" as const };
  }

  async onModuleDestroy() {
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
    await this.worker?.close();
    await this.queue?.close();
  }

  private async runMaintenance() {
    try {
      await this.outbox.drain();
      const hour = new Date().getUTCHours();
      if (hour === 0) {
        await this.operations.redactExpiredPii();
        await this.operations.dailySummary();
      }
    } catch (error) {
      // Logging here keeps maintenance failures visible without stopping recovery jobs.
      console.error("Recovery maintenance failed", error);
    }
  }

  private redisConnection(): ConnectionOptions {
    const url = new URL(this.config.get<string>("REDIS_URL") ?? "redis://127.0.0.1:6380");
    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
      maxRetriesPerRequest: null,
    };
  }
}
