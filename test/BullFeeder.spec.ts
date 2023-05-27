import type { Connection } from 'amqplib'
import { Redis } from 'ioredis'
import { afterEach, beforeEach, expect } from 'vitest'
import { z } from 'zod'

import { RabbitmqTaskInputSource } from '../lib/amqp/RabbitmqTaskInputSource'

import { FakeBullFeeder } from './FakeBullFeeder'
import { redisOptions } from './utils/TestRedisConfig'
import { resolveAmqpConnection } from './utils/amqpConnectionResolver'
import { buildQueueMessage } from './utils/queueUtils'
import { waitAndRetry } from './utils/waitUtils'

describe('BullFeeder', () => {
  let redis: Redis
  let bullfeeder: FakeBullFeeder
  let amqpConnection: Connection
  beforeEach(async () => {
    redis = new Redis(redisOptions)
    bullfeeder = new FakeBullFeeder({
      queueName: 'dummy',
      redis,
    })
    amqpConnection = await resolveAmqpConnection({
      hostname: 'localhost',
      vhost: '',
      port: 5672,
      username: 'guest',
      password: 'guest',
      useTls: false,
    })
  })

  afterEach(async () => {
    await amqpConnection.close()
    await redis.flushall()
    redis.disconnect()
  })

  describe('REST API source', () => {
    it('Creates new task', async () => {
      const messageSchema = z.any()

      const rabbitMqSource = new RabbitmqTaskInputSource({
        messageSchema,
        bullfeeder,
        amqpConnection: amqpConnection,
        queueName: 'inputQueue',
        targetJobTypeId: 'bullJob',
      })
      await rabbitMqSource.register()

      const channel = await amqpConnection.createChannel()

      channel.sendToQueue(
        'inputQueue',
        buildQueueMessage({
          messageType: 'dummyType',
          task: {
            id: 1,
          },
        }),
      )

      await waitAndRetry(() => {
        return bullfeeder.taskCounter === 1
      })
      expect(bullfeeder.lastTaskPayload).toEqual({
        id: 1,
      })

      await rabbitMqSource.close()
      await channel.close()
    })

    it('Creates new task with transformed payload', async () => {
      const messageSchema = z.object({
        messageType: z.string(),
        task: z.object({}),
      })

      const rabbitMqSource = new RabbitmqTaskInputSource({
        messageSchema,
        bullfeeder,
        amqpConnection: amqpConnection,
        queueName: 'inputQueue',
        targetJobTypeId: 'bullJob',
        transformer: (message) => {
          return {
            newValue: message.messageType,
          }
        },
      })
      await rabbitMqSource.register()

      const channel = await amqpConnection.createChannel()

      channel.sendToQueue(
        'inputQueue',
        buildQueueMessage({
          messageType: 'dummyType',
          task: {},
        }),
      )

      await waitAndRetry(() => {
        return bullfeeder.taskCounter === 1
      })
      expect(bullfeeder.lastTaskPayload).toEqual({
        newValue: 'dummyType',
      })

      await rabbitMqSource.close()
      await channel.close()
    })
  })
})
