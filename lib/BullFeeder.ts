import { Queue } from 'bullmq'
import type { Redis } from 'ioredis'

export type BullFeederConfig = {
  queueName: string
  redis: Redis
}

export type JobOptions = {
  jobTypeId: string
}

export class BullFeeder<TaskPayload = Record<string, unknown>> {
  private readonly queue: Queue

  constructor(config: BullFeederConfig) {
    this.queue = new Queue(config.queueName, { connection: config.redis })
  }

  createTask(jobOptions: JobOptions, taskPayload: TaskPayload): Promise<unknown> {
    return this.queue.add(jobOptions.jobTypeId, taskPayload)
  }
}
