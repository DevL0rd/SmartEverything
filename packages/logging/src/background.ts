import { isEventName } from './event-name';
import { Logger } from './logger';
import type { LogPayload } from './redaction';
import { assertScope } from './scope';

let scope = 'tool.background';

export function setBackgroundScope(next: string): void {
  scope = assertScope(next);
}

export function background(
  work: PromiseLike<unknown> | undefined,
  event: string,
  fields: LogPayload = {},
): void {
  if (work === undefined) return;
  const name = isEventName(event) ? event : 'background.failed';
  const extra = name === event ? fields : { ...fields, event };
  try {
    work.then(undefined, (cause: unknown) => {
      new Logger(scope).error(name, cause, extra);
    });
  } catch (cause) {
    new Logger(scope).error(name, cause, extra);
  }
}
