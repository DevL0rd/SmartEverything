import { isAbsolute, relative } from 'node:path';
import type { ClaudeSession } from '@smarteverything/domain';
import { providerWorkDirectory } from './options';
import type { ProviderSessions } from './sessions';

export type SessionRef = Pick<ClaudeSession, 'id' | 'cwd'>;

export interface OwnedSessions {
  readonly settled: () => Promise<void>;
  readonly owns: (session: SessionRef) => boolean;
}

function isInside(directory: string, path: string): boolean {
  const step = relative(directory, path);
  return step === '' || (!step.startsWith('..') && !isAbsolute(step));
}

export function ownedSessions(sessions: ProviderSessions, dataDirectory: string): OwnedSessions {
  const work = providerWorkDirectory(dataDirectory);
  return {
    settled: (): Promise<void> => sessions.settled(),
    owns: (session): boolean =>
      sessions.ownedIds().has(session.id) || (session.cwd !== null && isInside(work, session.cwd)),
  };
}
