const EVENT_NAME = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export class InvalidEventNameError extends Error {
  readonly received: string;

  constructor(received: string) {
    super(
      'an event name is lower case, dot separated and at least two parts long, such as ' +
        `"device.switched". It names what happened and never carries a value. Received "${received}"`,
    );
    this.name = 'InvalidEventNameError';
    this.received = received;
  }
}

export function isEventName(candidate: string): boolean {
  return EVENT_NAME.test(candidate);
}

export function assertEventName(candidate: string): string {
  if (!isEventName(candidate)) {
    throw new InvalidEventNameError(candidate);
  }
  return candidate;
}
