import type { LiveChange, PluginDataPoint, PluginStreamRow } from '@smarteverything/domain';
import type { ChangeFeed } from './feed';
import type { StoreHost } from './host/host';

function liveKey(pluginId: string, stream: string): string {
  return `${pluginId}\u0000${stream}`;
}

export class PluginLiveStreams {
  private readonly live = new Map<string, PluginStreamRow>();
  private readonly unsaved = new Set<string>();
  private viewed: { readonly seq: number; readonly deviceId: string } | null = null;

  constructor(
    private readonly feed: ChangeFeed,
    private readonly host: StoreHost,
  ) {}

  publish(pluginId: string, point: PluginDataPoint): void {
    this.emit(pluginId, point);
  }

  publishToViewers(pluginId: string, point: PluginDataPoint, deviceId: string): void {
    this.emit(pluginId, point, (seq) => {
      this.viewed = { seq, deviceId };
    });
  }

  viewersOf(change: LiveChange): string | null {
    const viewed = this.viewed;
    return change.table === 'plugin_streams' && viewed?.seq === change.seq ? viewed.deviceId : null;
  }

  private emit(pluginId: string, point: PluginDataPoint, onSequence?: (seq: number) => void): void {
    const key = liveKey(pluginId, point.stream);
    const before = this.live.get(key);
    const row = { plugin_id: pluginId, ...point };
    this.live.set(key, row);
    this.unsaved.add(key);
    this.feed.emit(
      {
        type: 'change',
        table: 'plugin_streams',
        operation: before === undefined ? 'INSERT' : 'UPDATE',
        record: row,
        oldRecord: before ?? null,
      },
      onSequence,
    );
  }

  async save(pluginId: string, stopping: boolean): Promise<void> {
    const saving = [...this.unsaved].flatMap((key) => {
      const row = this.live.get(key);
      return row?.plugin_id === pluginId ? [{ key, row }] : [];
    });
    if (saving.length > 0)
      await this.host.call(
        'pluginData',
        'saveLatest',
        pluginId,
        saving.map(({ row }) => ({ stream: row.stream, value: row.value, at: row.at })),
      );
    for (const { key, row } of saving) if (this.live.get(key) === row) this.unsaved.delete(key);
    if (!stopping) return;
    for (const [key, row] of this.live)
      if (row.plugin_id === pluginId && !this.unsaved.has(key)) this.live.delete(key);
  }

  overlay(saved: readonly PluginStreamRow[]): PluginStreamRow[] {
    const newer = new Map(saved.map((row) => [liveKey(row.plugin_id, row.stream), row]));
    for (const [key, row] of this.live) newer.set(key, row);
    return [...newer.values()];
  }

  async streams(): Promise<PluginStreamRow[]> {
    return this.overlay(await this.host.call('pluginData', 'streams'));
  }
}
