import type { Either } from '@lokalise/node-core'

import type { BullFeeder } from '../BullFeeder'
import type { TaskInputSource } from '../BullFeederTypes'

import type { QueueParams } from './AbstractRabbitmqConsumer'
import { AbstractRabbitMqConsumer } from './AbstractRabbitmqConsumer'
import type { CommonMessage } from './MessageTypes'

export type TaskInputMessage<TaskPayload = Record<string, unknown>> = CommonMessage & {
  task: TaskPayload
}

export type MessageTransformer<
  MessagePayloadType extends CommonMessage,
  TaskPayload = Record<string, unknown>,
> = (payload: MessagePayloadType) => TaskPayload

export type RabbitmqTaskInputSourceConfig<
  MessagePayloadType extends CommonMessage,
  TaskPayload = Record<string, unknown>,
> = {
  transformer?: MessageTransformer<MessagePayloadType, TaskPayload>
  bullfeeder: BullFeeder<TaskPayload>
  targetJobTypeId: string
} & QueueParams<MessagePayloadType>

export class RabbitmqTaskInputSource<
    MessagePayloadType extends TaskInputMessage<TaskPayload>,
    TaskPayload = Record<string, unknown>,
  >
  extends AbstractRabbitMqConsumer<MessagePayloadType>
  implements TaskInputSource
{
  private readonly bullfeeder: BullFeeder<TaskPayload>
  private readonly targetJobTypeId: string
  private readonly transformer?: MessageTransformer<MessagePayloadType, TaskPayload>

  constructor(config: RabbitmqTaskInputSourceConfig<MessagePayloadType, TaskPayload>) {
    super(config)
    this.bullfeeder = config.bullfeeder
    this.targetJobTypeId = config.targetJobTypeId
    this.transformer = config.transformer
  }

  async register() {
    await super.init()
    await super.consume()
  }

  async processMessage(
    messagePayload: MessagePayloadType,
  ): Promise<Either<'retryLater', 'success'>> {
    await this.bullfeeder.createTask(
      {
        jobTypeId: this.targetJobTypeId,
      },
      this.transformer ? this.transformer(messagePayload) : messagePayload.task,
    )

    return { result: 'success' }
  }
}
