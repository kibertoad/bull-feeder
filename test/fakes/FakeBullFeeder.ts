import type { JobOptions } from '../../lib/BullFeeder'
import { BullFeeder } from '../../lib/BullFeeder'

export class FakeBullFeeder extends BullFeeder {
  public taskCounter = 0
  public lastTaskPayload?: Record<string, unknown>

  override createTask(
    jobOptions: JobOptions,
    taskPayload: Record<string, unknown>,
  ): Promise<unknown> {
    this.taskCounter++
    this.lastTaskPayload = taskPayload
    return super.createTask(jobOptions, taskPayload)
  }
}
