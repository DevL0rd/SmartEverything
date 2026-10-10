import type { CallSession } from './call-session';

const SECOND_MS = 1000;

export interface PresenceDeps {
  readonly seconds: number;
  readonly approvedHere: (session: CallSession) => boolean;
  readonly leave: (guildId: string) => void;
}

export class Presence {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly deps: PresenceDeps) {}

  check(session: CallSession): void {
    const { guildId } = session;
    if (this.deps.approvedHere(session)) {
      this.clear(guildId);
      return;
    }
    if (this.timers.has(guildId)) {
      return;
    }
    const timer = setTimeout(() => {
      this.timers.delete(guildId);
      this.deps.leave(guildId);
    }, this.deps.seconds * SECOND_MS);
    timer.unref();
    this.timers.set(guildId, timer);
  }

  clear(guildId: string): void {
    clearTimeout(this.timers.get(guildId));
    this.timers.delete(guildId);
  }
}
