import type { HarnessSession } from './session';
import { HarnessRuntimeError } from './errors';

export function freezeConfigurationSessions(
  sessions: readonly HarnessSession[],
  protectedSessions: readonly string[],
): readonly HarnessSession[] {
  if (
    sessions.some(
      (session) => protectedSessions.includes(session.id) || !session.configurationIdle(),
    )
  )
    throw new HarnessRuntimeError(
      'composition_incompatible',
      'Shared configuration is waiting for active native work to settle.',
    );
  for (const session of sessions) session.freeze();
  return sessions;
}
