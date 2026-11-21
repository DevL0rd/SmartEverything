import { storeUnit } from '../../store/host/unit';

export interface LockedOpenInput {
  readonly tokenHash: string;
  readonly profileId: string;
  readonly clientId: string;
  readonly expiresAt: string;
}

export const PHOTO_LOCKED_OPEN_UNIT = storeUnit((store, input: LockedOpenInput) => {
  store.write(() => {
    store.photoLocked.expire();
    store.photoLocked.lock(input.profileId, input.clientId);
    store.photoLocked.issue(input.tokenHash, input.profileId, input.clientId, input.expiresAt);
  });
});
