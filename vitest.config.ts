import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    watch: false,
    environment: 'node',
    reporters: ['verbose'],
    coverage: {
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/*.spec.ts', 'lib/BullFeederTypes.ts', 'lib/amqp/MessageTypes.ts'],
      reporter: ['text'],
      all: true,
      statements: 88,
      branches: 76,
      functions: 80,
      lines: 88,
    },
  },
})
