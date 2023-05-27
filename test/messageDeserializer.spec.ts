import type { Message } from 'amqplib'
import { z } from 'zod'

import { ConsumerErrorResolver } from '../lib/amqp/ConsumerErrorResolver'
import { deserializeMessage } from '../lib/amqp/messageDeserializer'

export const PERMISSIONS_MESSAGE_SCHEMA = z.object({
  messageType: z.enum(['add', 'remove']),
  userIds: z.array(z.number()).describe('User IDs'),
  permissions: z.array(z.string()).nonempty().describe('List of user permissions'),
})

export type PERMISSIONS_MESSAGE_TYPE = z.infer<typeof PERMISSIONS_MESSAGE_SCHEMA>

describe('messageDeserializer', () => {
  it('deserializes valid JSON', () => {
    const messagePayload: PERMISSIONS_MESSAGE_TYPE = {
      messageType: 'add',
      userIds: [1],
      permissions: ['perm'],
    }
    const message: Message = {
      content: Buffer.from(JSON.stringify(messagePayload)),
    } as Message

    const errorProcessor = new ConsumerErrorResolver()

    const deserializedPayload = deserializeMessage(
      message,
      PERMISSIONS_MESSAGE_SCHEMA,
      errorProcessor,
    )

    expect(deserializedPayload.result).toMatchObject(messagePayload)
  })

  it('throws an error on invalid JSON', () => {
    const messagePayload: Partial<PERMISSIONS_MESSAGE_TYPE> = {
      userIds: [1],
    }
    const message: Message = {
      content: Buffer.from(JSON.stringify(messagePayload)),
    } as Message

    const errorProcessor = new ConsumerErrorResolver()

    const deserializedPayload = deserializeMessage(
      message,
      PERMISSIONS_MESSAGE_SCHEMA,
      errorProcessor,
    )

    expect(deserializedPayload.error).toMatchObject({
      errorCode: 'AMQP_VALIDATION_ERROR',
    })
  })

  it('throws an error on non-JSON', () => {
    const message: Message = {
      content: Buffer.from('dummy'),
    } as Message

    const errorProcessor = new ConsumerErrorResolver()

    const deserializedPayload = deserializeMessage(
      message,
      PERMISSIONS_MESSAGE_SCHEMA,
      errorProcessor,
    )

    expect(deserializedPayload.error).toMatchObject({
      errorCode: 'AMQP_MESSAGE_INVALID_FORMAT',
    })
  })
})
