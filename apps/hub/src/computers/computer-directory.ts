import { ComputerOfflineError } from './computer-errors';
import type { ComputerSession } from './computer-session';

export class ComputerDirectory {
  private readonly sessions = new Set<ComputerSession>();

  add(session: ComputerSession): () => void {
    this.sessions.add(session);
    return (): void => {
      this.sessions.delete(session);
    };
  }

  byExternalId(externalId: string): ComputerSession {
    return this.only((session) => session.owns(externalId));
  }

  byDevice(deviceId: string): ComputerSession {
    return this.only((session) => session.view()?.deviceId === deviceId);
  }

  online(deviceId: string): ComputerSession | null {
    return [...this.sessions].find((session) => session.view()?.deviceId === deviceId) ?? null;
  }

  private only(match: (session: ComputerSession) => boolean): ComputerSession {
    const session = [...this.sessions].find(match);
    if (session === undefined) {
      throw new ComputerOfflineError();
    }
    return session;
  }
}
