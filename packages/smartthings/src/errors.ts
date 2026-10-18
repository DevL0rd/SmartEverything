import type { z } from 'zod';

export class SmartThingsResponseError extends Error {
  override readonly name = 'SmartThingsResponseError';

  constructor(
    readonly subject: string,
    readonly received: unknown,
    readonly reason: string,
  ) {
    super(`The SmartThings ${subject} did not have the expected shape: ${reason}.`);
  }
}

export function issuePaths(error: z.ZodError): string {
  const paths = error.issues.map((issue) => issue.path.join('.') || 'the whole value');
  return [...new Set(paths)].join(', ');
}

export function parsed<T>(schema: z.ZodType<T>, received: unknown, subject: string): T {
  const result = schema.safeParse(received);
  if (!result.success) {
    throw new SmartThingsResponseError(subject, received, issuePaths(result.error));
  }
  return result.data;
}

export class SmartThingsCommandError extends Error {
  override readonly name = 'SmartThingsCommandError';

  constructor(
    readonly capability: string,
    readonly received: unknown,
    readonly reason: string,
  ) {
    super(
      `The ${capability} command cannot be built: ${reason}. Received ${JSON.stringify(received)}.`,
    );
  }
}

export class SamsungTvMessageError extends Error {
  override readonly name = 'SamsungTvMessageError';

  constructor(
    readonly received: unknown,
    readonly reason: string,
  ) {
    super(
      `The Samsung TV sent a message that could not be read: ${reason}. Received ${JSON.stringify(received)}.`,
    );
  }
}

export class InvalidMacAddressError extends Error {
  override readonly name = 'InvalidMacAddressError';

  constructor(readonly received: string) {
    super(
      `A MAC address is six pairs of hexadecimal digits separated by colons or dashes. Received "${received}".`,
    );
  }
}
