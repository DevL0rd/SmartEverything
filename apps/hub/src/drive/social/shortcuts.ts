import type {
  DriveQuery,
  DriveShortcut,
  DriveShortcutChange,
  DriveShortcutCreate,
  DriveVia,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { DriveActor } from '../access';

export interface ShortcutsEnv {
  readonly store: Pick<Store, 'host'>;
}

export type ShortcutActor = DriveActor & { readonly via: DriveVia };

export function shortcutsForQuery(
  store: Pick<Store, 'host'>,
  actor: DriveActor,
  query: DriveQuery,
): Promise<DriveShortcut[]> {
  return store.host.read('driveShortcutsForQuery', { actor, query });
}

export class DriveShortcuts {
  constructor(private readonly env: ShortcutsEnv) {}

  create(actor: ShortcutActor, input: DriveShortcutCreate): Promise<DriveShortcut> {
    return this.env.store.host.write('driveShortcutCreate', { actor, create: input });
  }

  update(
    actor: DriveActor,
    shortcutId: string,
    change: DriveShortcutChange,
  ): Promise<DriveShortcut> {
    return this.env.store.host.write('driveShortcutUpdate', { actor, shortcutId, change });
  }

  async remove(actor: DriveActor, shortcutId: string): Promise<void> {
    await this.env.store.host.write('driveShortcutRemove', { actor, shortcutId });
  }
}
