import { randomBytes } from 'node:crypto';

const STATE_LIFETIME_MS = 10 * 60 * 1000;

export interface PendingLink {
  readonly redirectUri: string;
  readonly requestedBy: string;
  readonly expiresAt: number;
}

export class OAuthStates {
  private readonly pending = new Map<string, PendingLink>();

  constructor(private readonly now: () => Date) {}

  create(redirectUri: string, requestedBy: string): { state: string; expiresAt: Date } {
    const nowMs = this.now().getTime();
    for (const [state, link] of this.pending) {
      if (link.expiresAt <= nowMs) {
        this.pending.delete(state);
      }
    }
    const state = randomBytes(32).toString('base64url');
    const expiresAt = nowMs + STATE_LIFETIME_MS;
    this.pending.set(state, { redirectUri, requestedBy, expiresAt });
    return { state, expiresAt: new Date(expiresAt) };
  }

  consume(state: string): PendingLink | null {
    const link = this.pending.get(state);
    this.pending.delete(state);
    if (link === undefined || link.expiresAt <= this.now().getTime()) {
      return null;
    }
    return link;
  }
}
