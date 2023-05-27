import type { Either } from '@lokalise/node-core'
import type { Channel, Connection, Message } from 'amqplib'
import type { ZodSchema } from 'zod'

import type { ErrorReporter, TransactionObservabilityManager } from '../publicErrors'
import { dummyErrorReporter, dummyTransactionObservabilityManager } from '../publicErrors'
import { isError } from '../typeUtils'

import { ConsumerErrorResolver } from './ConsumerErrorResolver'
import type { CommonMessage } from './MessageTypes'
import { AmqpMessageInvalidFormat, AmqpValidationError } from './amqpErrors'
import { deserializeMessage } from './messageDeserializer'

export type QueueParams<MessagePayloadType extends CommonMessage> = {
  queueName: string
  messageSchema: ZodSchema<MessagePayloadType>
  amqpConnection: Connection
  consumerErrorResolver?: ConsumerErrorResolver
  transactionObservabilityManager?: TransactionObservabilityManager
  errorReporter?: ErrorReporter
}

const ABORT_EARLY_EITHER: Either<'abort', never> = {
  error: 'abort',
}

export abstract class AbstractRabbitMqConsumer<MessagePayloadType extends CommonMessage> {
  protected readonly queueName: string
  protected readonly connection: Connection
  // @ts-ignore
  protected channel: Channel
  protected readonly errorResolver: ConsumerErrorResolver
  private isShuttingDown: boolean
  protected errorReporter: ErrorReporter
  protected transactionObservabilityManager: TransactionObservabilityManager
  protected messageSchema: ZodSchema<MessagePayloadType>

  constructor(params: QueueParams<MessagePayloadType>) {
    this.connection = params.amqpConnection
    this.errorResolver = params.consumerErrorResolver ?? new ConsumerErrorResolver()
    this.isShuttingDown = false
    this.queueName = params.queueName
    this.messageSchema = params.messageSchema
    this.errorReporter = params.errorReporter ?? dummyErrorReporter
    this.transactionObservabilityManager =
      params.transactionObservabilityManager ?? dummyTransactionObservabilityManager
  }

  private async destroyConnection(): Promise<void> {
    if (this.channel) {
      try {
        await this.channel.close()
      } finally {
        // @ts-ignore
        this.channel = undefined
      }
    }
  }

  public async init() {
    this.isShuttingDown = false

    // If channel exists, recreate it
    if (this.channel) {
      this.isShuttingDown = true
      await this.destroyConnection()
      this.isShuttingDown = false
    }

    this.channel = await this.connection.createChannel()
    this.channel.on('close', () => {
      if (!this.isShuttingDown) {
        this.errorReporter.report({
          error: new Error(`AMQP connection lost for queue ${this.queueName}`),
        })
        this.init().catch((err) => {
          this.errorReporter.report({ error: err })
          throw err
        })
      }
    })
    this.channel.on('error', (err) => {
      this.errorReporter.report({ error: err })
    })

    await this.channel.assertQueue(this.queueName, {
      exclusive: false,
      durable: true,
      autoDelete: false,
    })
  }

  async close(): Promise<void> {
    this.isShuttingDown = true
    await this.destroyConnection()
  }

  abstract processMessage(
    messagePayload: MessagePayloadType,
  ): Promise<Either<'retryLater', 'success'>>

  private deserializeMessage(message: Message | null): Either<'abort', MessagePayloadType> {
    if (message === null) {
      return ABORT_EARLY_EITHER
    }

    const deserializationResult = deserializeMessage(
      message,
      this.messageSchema,
      this.errorResolver,
    )

    if (
      deserializationResult.error instanceof AmqpValidationError ||
      deserializationResult.error instanceof AmqpMessageInvalidFormat
    ) {
      this.errorReporter.report({ error: deserializationResult.error })
      return ABORT_EARLY_EITHER
    }

    // Empty content for whatever reason
    if (!deserializationResult.result) {
      return ABORT_EARLY_EITHER
    }

    return {
      result: deserializationResult.result,
    }
  }

  async consume() {
    await this.init()
    if (!this.channel) {
      throw new Error('Channel is not set')
    }

    await this.channel.consume(this.queueName, (message) => {
      if (message === null) {
        return
      }

      const deserializedMessage = this.deserializeMessage(message)
      if (deserializedMessage.error === 'abort') {
        this.channel.nack(message, false, false)
        return
      }
      const transactionSpanId = `queue_${this.queueName}:${deserializedMessage.result.messageType}`

      this.transactionObservabilityManager.start(transactionSpanId)
      this.processMessage(deserializedMessage.result)
        .then((result) => {
          if (result.error === 'retryLater') {
            this.channel.nack(message, false, true)
          }
          if (result.result === 'success') {
            this.channel.ack(message)
          }
        })
        .catch((err) => {
          // ToDo we need sanity check to stop trying at some point, perhaps some kind of Redis counter
          // If we fail due to unknown reason, let's retry
          this.channel.nack(message, false, true)
          if (isError(err)) {
            this.errorReporter.report({ error: err })
          }
        })
        .finally(() => {
          this.transactionObservabilityManager.stop(transactionSpanId)
        })
    })
  }
}
