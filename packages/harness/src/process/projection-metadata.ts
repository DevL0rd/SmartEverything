import type { AiHarnessSession } from '@smarteverything/domain';
import type { HarnessRuntimeEvent } from '../host/events';
import type { ProcessContextProjection } from './projection-context';

export function projectProcessMetadata(
  event: Extract<HarnessRuntimeEvent, { kind: 'commands' | 'context' }>,
  ports: {
    readonly sessions: Map<string, AiHarnessSession>;
    readonly contexts: ReadonlyMap<string, ProcessContextProjection>;
    readonly context: (id: string) => Promise<void>;
    readonly state: (id: string, session: AiHarnessSession) => Promise<void>;
  },
): Promise<void> {
  if (event.kind === 'context') {
    ports.contexts.get(event.sessionId)?.estimate(event.estimate);
    return ports.context(event.sessionId);
  }
  const session = ports.sessions.get(event.sessionId);
  if (session === undefined) return Promise.resolve();
  const updated = { ...session, commands_revision: event.revision };
  ports.sessions.set(event.sessionId, updated);
  return ports.state(event.sessionId, updated);
}
