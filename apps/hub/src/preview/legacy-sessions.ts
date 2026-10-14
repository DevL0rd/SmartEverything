import { ApiError, type DshSessionEvent } from '@smarteverything/domain';
import type { Store } from '../store/store';
export interface LegacyHtmlSession {
  readonly id: string;
  readonly events: readonly DshSessionEvent[];
}
export function legacyHtmlSessions(
  store: Store,
  chat: string,
  profile: string,
): readonly LegacyHtmlSession[] {
  return store.dshSessions
    .list(profile)
    .filter((session) => session.chat_id === chat)
    .map((session) => {
      if (session.next_seq > 100_000)
        throw new ApiError(
          'conflict',
          'Canonical HTML inventory exceeds its bounded session window; supply a reviewed exact range.',
        );
      const events: DshSessionEvent[] = [];
      for (let offset = session.inherited_event_count; offset < session.next_seq; offset += 10_000)
        events.push(
          ...store.dshSessions.read(
            {
              session_id: session.header.id,
              offset,
              limit: Math.min(10_000, session.next_seq - offset),
            },
            profile,
          ).events,
        );
      return { id: session.header.id, events };
    });
}
