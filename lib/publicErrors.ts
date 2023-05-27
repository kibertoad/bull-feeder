// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FreeformRecord = Record<string, any>

export interface ErrorReport {
  error: Error
  context?: Record<string, unknown>
}

export type ErrorReporter = {
  report: (errorReport: ErrorReport) => void
}

export type TransactionObservabilityManager = {
  start: (transactionSpanId: string) => unknown
  stop: (transactionSpanId: string) => unknown
}

export const dummyTransactionObservabilityManager: TransactionObservabilityManager = {
  start: () => {},
  stop: () => {},
}

export const dummyErrorReporter: ErrorReporter = {
  report(errorReport: ErrorReport) {
    console.error(`Error: ${errorReport.error.message}`)
  },
}

export type CommonErrorParams = {
  message: string
  details?: FreeformRecord
}

export type OptionalMessageErrorParams = {
  message?: string
  details?: FreeformRecord
}
