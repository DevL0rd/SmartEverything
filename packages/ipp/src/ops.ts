export const OPERATION = {
  printJob: 0x0002,
  validateJob: 0x0004,
  createJob: 0x0005,
  sendDocument: 0x0006,
  cancelJob: 0x0008,
  getJobAttributes: 0x0009,
  getJobs: 0x000a,
  getPrinterAttributes: 0x000b,
  holdJob: 0x000c,
  releaseJob: 0x000d,
  pausePrinter: 0x0010,
  resumePrinter: 0x0011,
  purgeJobs: 0x0012,
  createPrinterSubscriptions: 0x0016,
  renewSubscription: 0x001a,
  cancelSubscription: 0x001b,
  getNotifications: 0x001c,
  cancelJobs: 0x0038,
  cancelMyJobs: 0x0039,
  closeJob: 0x003b,
  identifyPrinter: 0x003c,
  getSystemAttributes: 0x005b,
} as const;

export type OperationName = keyof typeof OPERATION;

const OPERATION_NAMES: ReadonlyMap<number, string> = new Map(
  Object.entries(OPERATION).map(([name, code]) => [code, name]),
);

export function operationName(code: number): string {
  return OPERATION_NAMES.get(code) ?? `operation 0x${code.toString(16).padStart(4, '0')}`;
}

export const STATUS = {
  ok: 0x0000,
  okIgnoredOrSubstituted: 0x0001,
  okConflicting: 0x0002,
  okEventsComplete: 0x0007,
  badRequest: 0x0400,
  forbidden: 0x0401,
  notAuthenticated: 0x0402,
  notAuthorized: 0x0403,
  notPossible: 0x0404,
  timeout: 0x0405,
  notFound: 0x0406,
  gone: 0x0407,
  requestEntityTooLarge: 0x0408,
  requestValueTooLong: 0x0409,
  documentFormatNotSupported: 0x040a,
  attributesOrValuesNotSupported: 0x040b,
  uriSchemeNotSupported: 0x040c,
  charsetNotSupported: 0x040d,
  conflictingAttributes: 0x040e,
  compressionNotSupported: 0x040f,
  compressionError: 0x0410,
  documentFormatError: 0x0411,
  documentAccessError: 0x0412,
  internalError: 0x0500,
  operationNotSupported: 0x0501,
  serviceUnavailable: 0x0502,
  versionNotSupported: 0x0503,
  deviceError: 0x0504,
  temporaryError: 0x0505,
  notAcceptingJobs: 0x0506,
  busy: 0x0507,
  jobCanceled: 0x0508,
  multipleDocumentJobsNotSupported: 0x0509,
} as const;

const STATUS_NAMES: ReadonlyMap<number, string> = new Map(
  Object.entries(STATUS).map(([name, code]) => [code, name]),
);

export function statusName(code: number): string {
  return STATUS_NAMES.get(code) ?? `status 0x${code.toString(16).padStart(4, '0')}`;
}

export function isSuccess(code: number): boolean {
  return code < 0x0100;
}

export const PRINTER_STATE = { idle: 3, processing: 4, stopped: 5 } as const;

export const JOB_STATE = {
  pending: 3,
  pendingHeld: 4,
  processing: 5,
  processingStopped: 6,
  canceled: 7,
  aborted: 8,
  completed: 9,
} as const;

export const QUALITY = { draft: 3, normal: 4, high: 5 } as const;

export const ORIENTATION = {
  portrait: 3,
  landscape: 4,
  reverseLandscape: 5,
  reversePortrait: 6,
} as const;
