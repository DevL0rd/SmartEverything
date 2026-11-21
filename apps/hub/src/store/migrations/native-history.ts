import {
  KNOWN_SESSION_EVENT_TYPES,
  adoptSessionEvent,
  type SessionEvent,
} from '@deepseek-ai/dsh-session';
import {
  DSH_SESSION_EVENT,
  DSH_SESSION_EVENTS_WRITE,
  DSH_SESSION_HEADER,
} from '@smarteverything/domain';
import { z } from 'zod';

const NATIVE_EVENTS = z.array(
  z.custom<SessionEvent>((value) => DSH_SESSION_EVENT.safeParse(value).success),
);

export class NativeHistoryFormatError extends Error {
  override readonly name = 'NativeHistoryFormatError';

  constructor(sessionId: string, reason: string) {
    super(`The imported native session ${sessionId} cannot be read: ${reason}.`);
  }
}

export function nativeHistoryOf(header: unknown, events: unknown): readonly SessionEvent[] {
  const { id } = DSH_SESSION_HEADER.parse(header);
  return NATIVE_EVENTS.parse(DSH_SESSION_EVENTS_WRITE.parse(events)).map((event) => {
    if (!KNOWN_SESSION_EVENT_TYPES.has(event.type) && event.ignorable !== true)
      throw new NativeHistoryFormatError(id, `event type ${event.type} is unknown`);
    return adoptSessionEvent(event);
  });
}
