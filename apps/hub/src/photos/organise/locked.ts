import { randomBytes } from 'node:crypto';
import {
  ApiError,
  type LockedPinSet,
  type LockedState,
  type LockedUnlocked,
} from '@smarteverything/domain';
import { GuessLimiter, hashToken } from '../../drive/shares';
import type { StoreHost } from '../../store/host/host';
import type { LockedPin, PhotoUnlock } from '../../store/repositories/photo-locked';
import type { LockedOpenInput } from './locked-units';
import { hashPin, pinMatches } from './pin';

export const UNLOCK_LIFETIME_MS = 10 * 60_000;

const TOKEN_BYTES = 32;

export interface LockedPort {
  readonly pin: (profileId: string) => Promise<LockedPin | undefined>;
  readonly setPin: (profileId: string, pin: LockedPin) => Promise<void>;
  readonly open: (session: LockedOpenInput) => Promise<void>;
  readonly unlock: (tokenHash: string) => Promise<PhotoUnlock | undefined>;
  readonly lock: (profileId: string, clientId: string) => Promise<number>;
}

export function hostLocked(host: StoreHost): LockedPort {
  return {
    pin: (profileId) => host.call('photoLocked', 'pin', profileId),
    setPin: (profileId, pin) => host.call('photoLocked', 'setPin', profileId, pin),
    open: (session) => host.write('photoLockedOpen', session),
    unlock: (tokenHash) => host.call('photoLocked', 'unlock', tokenHash),
    lock: (profileId, clientId) => host.call('photoLocked', 'lock', profileId, clientId),
  };
}

export interface LockedEnv {
  readonly locked: LockedPort;
  readonly now: () => Date;
}

export class LockedService {
  private readonly guesses: GuessLimiter;

  constructor(private readonly env: LockedEnv) {
    this.guesses = new GuessLimiter(env.now);
  }

  async state(profileId: string): Promise<LockedState> {
    return { configured: (await this.env.locked.pin(profileId)) !== undefined };
  }

  async setPin(profileId: string, change: LockedPinSet): Promise<void> {
    const current = await this.env.locked.pin(profileId);
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
    await this.env.locked.setPin(profileId, await hashPin(change.pin));
  }

  async unlock(profileId: string, clientId: string, pin: string): Promise<LockedUnlocked> {
    const stored = await this.env.locked.pin(profileId);
    if (stored === undefined) {
      throw new ApiError('invalid_request', 'Set a Locked folder PIN first.');
    }
    await this.verify(profileId, stored, pin);
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(this.env.now().getTime() + UNLOCK_LIFETIME_MS).toISOString();
    await this.env.locked.open({ tokenHash: hashToken(token), profileId, clientId, expiresAt });
    return { token, expiresAt };
  }

  async lock(profileId: string, clientId: string): Promise<void> {
    await this.env.locked.lock(profileId, clientId);
  }

  async require(profileId: string, clientId: string, token: string | undefined): Promise<string> {
    const session = token === undefined ? undefined : hashToken(token);
    const unlock = session === undefined ? undefined : await this.env.locked.unlock(session);
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
