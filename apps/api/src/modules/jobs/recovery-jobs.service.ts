import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import type { BatchRecoveryRunRequest } from "@revrec/shared";
import { AgentService } from "../agent/agent.service";

const QUEUE_NAME = "recovery-workflows";

@Injectable()
export class RecoveryJobsService implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue<BatchRecoveryRunRequest>;
  private worker?: Worker<BatchRecoveryRunRequest>;

  constructor(private readonly config: ConfigService, private readonly agent: AgentService) {}

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
    await this.worker?.close();
    await this.queue?.close();
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
