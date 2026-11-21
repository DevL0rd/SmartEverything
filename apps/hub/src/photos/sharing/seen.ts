import { z } from 'zod';
import type { HostStore } from '../../store/host/host-store';

const SEEN = z.record(z.string(), z.record(z.string(), z.string()));

const KEY = 'photos-album-seen';

export type SeenStore = Pick<HostStore, 'settingsKv'>;

export class AlbumSeen {
  constructor(private readonly store: SeenStore) {}

  of(profileId: string): Readonly<Record<string, string>> {
    return this.all()[profileId] ?? {};
  }

  mark(profileId: string, albumId: string, at: string): void {
    this.store.settingsKv.save(KEY, {
      ...this.all(),
      [profileId]: { ...this.of(profileId), [albumId]: at },
    });
  }

  forget(profileId: string, albumId: string): void {
    const kept = Object.entries(this.of(profileId)).filter(([id]) => id !== albumId);
    this.store.settingsKv.save(KEY, { ...this.all(), [profileId]: Object.fromEntries(kept) });
  }

  private all(): Readonly<Record<string, Readonly<Record<string, string>>>> {
    const stored = this.store.settingsKv.read(KEY);
    return stored === null ? {} : SEEN.parse(stored);
  }
}
