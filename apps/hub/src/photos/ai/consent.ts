import { PHOTOS_CLIENT_PREFS, type PhotosPref } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';

export class ConsentUnreadableError extends Error {
  override readonly name = 'ConsentUnreadableError';

  constructor(
    readonly profileId: string,
    readonly reason: string,
  ) {
    super(`The Photos preferences of ${profileId} cannot be read: ${reason}`);
  }
}

export type ConsentStore = Pick<Store, 'personal' | 'personAccess' | 'driveRoots'>;

export interface ConsentSwitches {
  readonly smartSearch: boolean;
  readonly faceGrouping: boolean;
}

export class PhotoConsent {
  constructor(
    private readonly store: ConsentStore,
    private readonly log: Logger,
  ) {}

  switches(profileId: string): ConsentSwitches {
    const read = this.store.personal.pref(PHOTOS_CLIENT_PREFS.photos, {
      clientId: profileId,
      profileId,
    });
    if (read.status === 'invalid') {
      this.log.warn('consent.unreadable', { profileId, reason: read.reason });
      return { smartSearch: false, faceGrouping: false };
    }
    if (read.status === 'absent') {
      return {
        smartSearch: this.store.personAccess.ownerIds().includes(profileId),
        faceGrouping: read.value.faceGrouping,
      };
    }
    return { smartSearch: read.value.smartSearch, faceGrouping: read.value.faceGrouping };
  }

  smartSearch(profileId: string): boolean {
    return this.switches(profileId).smartSearch;
  }

  faceGrouping(profileId: string): boolean {
    return this.switches(profileId).faceGrouping;
  }

  subjectOfRoot(rootId: string): string {
    const root = this.store.driveRoots.byId(rootId);
    return root.ownerProfileId ?? this.store.personAccess.homeOwner();
  }

  apply(profileId: string, change: Partial<ConsentSwitches>): ConsentSwitches {
    const owner = { clientId: profileId, profileId };
    const read = this.store.personal.pref(PHOTOS_CLIENT_PREFS.photos, owner);
    if (read.status === 'invalid') throw new ConsentUnreadableError(profileId, read.reason);
    const current = this.switches(profileId);
    const value: PhotosPref = { ...read.value, ...current, ...change };
    this.store.personal.saveLayout(
      owner,
      PHOTOS_CLIENT_PREFS.photos.storageKey,
      PHOTOS_CLIENT_PREFS.photos.encode(value),
    );
    return { smartSearch: value.smartSearch, faceGrouping: value.faceGrouping };
  }
}
