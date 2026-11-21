import type { AutomationPluginKindRow, NodeKind } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ChangeFeed } from '../../store/feed';
import type { StoreHost } from '../../store/host/host';
import { pluginKindsOf } from '../program-data';
import type { KindLedger } from './catalog';
import type { KindWrites } from './store';

export class KindLedgerNotLoadedError extends Error {
  override readonly name = 'KindLedgerNotLoadedError';

  constructor() {
    super('The stored plugin kinds were read before they were loaded from the store host.');
  }
}

export class HostKindLedger implements KindLedger {
  private readonly rows = new Map<string, AutomationPluginKindRow>();
  private readonly pending: {
    record: AutomationPluginKindRow | null;
    old: AutomationPluginKindRow | null;
  }[] = [];
  private loading: Promise<void> | null = null;
  private ready = false;

  constructor(
    feed: ChangeFeed,
    private readonly host: StoreHost,
    private readonly kinds: () => readonly NodeKind[],
  ) {
    feed.subscribe((change) => {
      if (change.table !== 'automation_plugin_kinds') return;
      if (this.ready) this.apply(change.record, change.oldRecord);
      else if (this.loading !== null)
        this.pending.push({ record: change.record, old: change.oldRecord });
    });
  }

  load(): Promise<void> {
    this.loading ??= this.fill();
    return this.loading;
  }

  readonly stored = (owner: string): readonly AutomationPluginKindRow[] => {
    this.assertReady();
    return [...this.rows.values()]
      .filter((row) => row.owner === owner)
      .sort((a, b) => (a.kind_id < b.kind_id ? -1 : a.kind_id > b.kind_id ? 1 : 0));
  };

  readonly row = (kindId: string): AutomationPluginKindRow | undefined => {
    this.assertReady();
    return this.rows.get(kindId);
  };

  readonly migrated: KindLedger['migrated'] = (migrations) => {
    if (migrations.length === 0) return;
    background(
      this.host.write('migratePluginKinds', {
        migrations,
        kinds: pluginKindsOf({ kinds: this.kinds }),
      }),
      'plugin_kinds.migration_failed',
      { kinds: migrations.map((migration) => migration.kindId).join(', ') },
    );
  };

  readonly writes: KindWrites = async (batch) => {
    await this.host.write('persistPluginKinds', batch);
  };

  private assertReady(): void {
    if (!this.ready) throw new KindLedgerNotLoadedError();
  }

  private async fill(): Promise<void> {
    for (const row of await this.host.call('pluginKinds', 'all')) this.rows.set(row.kind_id, row);
    for (const change of this.pending.splice(0)) this.apply(change.record, change.old);
    this.ready = true;
  }

  private apply(
    record: AutomationPluginKindRow | null,
    oldRecord: AutomationPluginKindRow | null,
  ): void {
    if (oldRecord !== null) this.rows.delete(oldRecord.kind_id);
    if (record !== null) this.rows.set(record.kind_id, record);
  }
}
