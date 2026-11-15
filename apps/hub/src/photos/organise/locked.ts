import { randomBytes } from 'node:crypto';
import {
  ApiError,
  type LockedPinSet,
  type LockedState,
  type LockedUnlocked,
} from '@smarteverything/domain';
import { GuessLimiter, hashToken } from '../../drive/shares';
import type { LockedPin, PhotoLockedRepository } from '../../store/repositories/photo-locked';
import { hashPin, pinMatches } from './pin';

export const UNLOCK_LIFETIME_MS = 10 * 60_000;

const TOKEN_BYTES = 32;

export interface LockedEnv {
  readonly locked: Pick<
    PhotoLockedRepository,
    'pin' | 'setPin' | 'issue' | 'unlock' | 'lock' | 'expire'
  >;
  readonly now: () => Date;
}

export class LockedService {
  private readonly guesses: GuessLimiter;

  constructor(private readonly env: LockedEnv) {
    this.guesses = new GuessLimiter(env.now);
  }

  state(profileId: string): LockedState {
    return { configured: this.env.locked.pin(profileId) !== undefined };
  }

  async setPin(profileId: string, change: LockedPinSet): Promise<void> {
    const current = this.env.locked.pin(profileId);
    if (current === undefined) {
      if (change.currentPin !== null) {
        throw new ApiError('invalid_request', 'There is no Locked folder PIN to change yet.');
      }
    } else {
      if (change.currentPin === null) {
        throw new ApiError('invalid_request', 'Send the current PIN to change it.');
      }
      await this.verify(profileId, current, change.currentPin);
    }
    this.env.locked.setPin(profileId, await hashPin(change.pin));
  }

  async unlock(profileId: string, clientId: string, pin: string): Promise<LockedUnlocked> {
    const stored = this.env.locked.pin(profileId);
    if (stored === undefined) {
      throw new ApiError('invalid_request', 'Set a Locked folder PIN first.');
    }
    await this.verify(profileId, stored, pin);
    this.env.locked.expire();
    this.env.locked.lock(profileId, clientId);
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(this.env.now().getTime() + UNLOCK_LIFETIME_MS).toISOString();
    this.env.locked.issue(hashToken(token), profileId, clientId, expiresAt);
    return { token, expiresAt };
  }

  lock(profileId: string, clientId: string): void {
    this.env.locked.lock(profileId, clientId);
  }

  require(profileId: string, clientId: string, token: string | undefined): string {
    const session = token === undefined ? undefined : hashToken(token);
    const unlock = session === undefined ? undefined : this.env.locked.unlock(session);
    if (session === undefined || unlock?.profileId !== profileId || unlock.clientId !== clientId) {
      throw new ApiError('forbidden', 'Unlock the Locked folder first.');
    }
    return session;
  }

  private async verify(profileId: string, stored: LockedPin, pin: string): Promise<void> {
    this.guesses.check(profileId);
    if (!(await pinMatches(stored, pin))) {
      this.guesses.fail(profileId);
      throw new ApiError('forbidden', 'The Locked folder PIN is wrong.');
    }
  }
}
