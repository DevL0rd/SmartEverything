import { z } from 'zod';
import type { StoreContext } from '../context';

const PIN = z.strictObject({ pin_hash: z.string(), pin_salt: z.string() });

const UNLOCK = z.strictObject({
  profile_id: z.string(),
  client_id: z.string(),
  expires_at: z.string(),
});

export interface LockedPin {
  readonly hash: string;
  readonly salt: string;
}

export interface PhotoUnlock {
  readonly profileId: string;
  readonly clientId: string;
  readonly expiresAt: string;
}

export class PhotoLockedRepository {
  constructor(private readonly context: StoreContext) {}

  pin(profileId: string): LockedPin | undefined {
    const row = this.context.sql.get(
      PIN,
      'select pin_hash, pin_salt from photo_locked where profile_id = $profileId',
      { profileId },
    );
    return row === undefined ? undefined : { hash: row.pin_hash, salt: row.pin_salt };
  }

  setPin(profileId: string, pin: LockedPin): void {
    this.context.write(() => {
      this.context.sql.run(
        'save the Locked folder PIN',
        `insert into photo_locked (profile_id, pin_hash, pin_salt, created_at)
          values ($profileId, $hash, $salt, $now)
          on conflict (profile_id) do update set pin_hash = excluded.pin_hash,
            pin_salt = excluded.pin_salt`,
        { profileId, hash: pin.hash, salt: pin.salt, now: this.context.now() },
      );
      this.context.sql.run(
        'end the open Locked folder sessions',
        'delete from photo_unlocks where profile_id = $profileId',
        { profileId },
      );
    });
  }

  issue(tokenHash: string, profileId: string, clientId: string, expiresAt: string): void {
    this.context.write(() => {
      this.context.sql.run(
        'open a Locked folder session',
        `insert into photo_unlocks (token_hash, profile_id, client_id, expires_at)
          values ($tokenHash, $profileId, $clientId, $expiresAt)`,
        { tokenHash, profileId, clientId, expiresAt },
      );
    });
  }

  unlock(tokenHash: string): PhotoUnlock | undefined {
    const row = this.context.sql.get(
      UNLOCK,
      `select profile_id, client_id, expires_at from photo_unlocks
        where token_hash = $tokenHash and expires_at > $now`,
      { tokenHash, now: this.context.now() },
    );
    return row === undefined
      ? undefined
      : { profileId: row.profile_id, clientId: row.client_id, expiresAt: row.expires_at };
  }

  lock(profileId: string, clientId: string): number {
    return this.context.write(() =>
      this.context.sql.run(
        'close the Locked folder sessions of the client',
        'delete from photo_unlocks where profile_id = $profileId and client_id = $clientId',
        { profileId, clientId },
      ),
    );
  }

  expire(): number {
    return this.context.write(() =>
      this.context.sql.run(
        'drop the expired Locked folder sessions',
        'delete from photo_unlocks where expires_at <= $now',
        { now: this.context.now() },
      ),
    );
  }
}
