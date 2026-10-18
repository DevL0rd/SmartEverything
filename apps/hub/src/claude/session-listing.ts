import type { ClaudeSession } from '@smarteverything/domain';
import type { SessionRef } from './provider/owned-sessions';

export interface SessionQuery {
  readonly state?: ClaudeSession['state'] | undefined;
  readonly archived: boolean;
  readonly limit: number;
}

function byRecency(left: ClaudeSession, right: ClaudeSession): number {
  const running = Number(right.state !== 'stopped') - Number(left.state !== 'stopped');
  return running === 0 ? (right.updated_at ?? '').localeCompare(left.updated_at ?? '') : running;
}

export function listSessions(
  sessions: readonly ClaudeSession[],
  query: SessionQuery,
  owns: (session: SessionRef) => boolean,
): ClaudeSession[] {
  return sessions
    .filter(
      (session) =>
        session.archived === query.archived &&
        (query.state === undefined || session.state === query.state) &&
        !owns(session),
    )
    .sort(byRecency)
    .slice(0, query.limit);
}
