import {
  VACUUM_ROOM_LINKS_KEY,
  type AutomationValueRow,
  type DeviceEffectTarget,
  type DeviceGroupRow,
  type DeviceRow,
  type LiveChange,
  type PluginStreamRow,
  type ProfileRow,
  type RoomRow,
  type SettingsRow,
  type StateRow,
  type WeatherRow,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { StoreNotFoundError } from '../../store/context';
import type { ChangeFeed } from '../../store/feed';
import type { HomeMirror } from '../../store/home-mirror';
import type { StoreHost } from '../../store/host/host';
import type { PhoneContextEntry } from '../../store/repositories/phone-contexts';
import { VacuumLinkRows } from './vacuum-links';

export interface WorldSource {
  readonly devices: {
    readonly list: () => DeviceRow[];
    readonly find: (id: string) => DeviceRow | undefined;
    readonly byId: (id: string) => DeviceRow;
  };
  readonly rooms: { readonly byId: (id: string) => RoomRow };
  readonly deviceGroups: {
    readonly list: () => DeviceGroupRow[];
    readonly byId: (id: string) => DeviceGroupRow;
  };
  readonly state: { readonly ofDevice: (deviceId: string) => StateRow[] };
  readonly settings: { readonly read: () => SettingsRow };
  readonly weather: { readonly read: () => WeatherRow };
  readonly phoneContexts: {
    readonly byDevice: (deviceId: string) => PhoneContextEntry | undefined;
    readonly latestOf: (profileId: string) => PhoneContextEntry | undefined;
  };
  readonly deviceEffects: {
    readonly find: (deviceId: string, capability: string) => DeviceEffectTarget | undefined;
  };
  readonly automationValues: { readonly byId: (id: string) => AutomationValueRow };
  readonly profiles: { readonly list: () => ProfileRow[] };
  readonly pluginStreams: { readonly list: () => PluginStreamRow[] };
  readonly vacuumRooms: { readonly linked: (deviceId: string) => ReadonlyMap<number, string> };
  readonly load: () => Promise<void>;
}

export class WorldMirrorNotLoadedError extends Error {
  override readonly name = 'WorldMirrorNotLoadedError';

  constructor() {
    super('The automation world was read before it was loaded from the store host.');
  }
}

type Mirrored = Extract<
  LiveChange,
  | { table: 'rooms' }
  | { table: 'device_groups' }
  | { table: 'device_effect_targets' }
  | { table: 'automation_values' }
  | { table: 'profiles' }
  | { table: 'weather' }
  | { table: 'plugin_streams' }
  | { table: 'plugins' }
  | { table: 'devices' }
>;

const MIRRORED: ReadonlySet<LiveChange['table']> = new Set([
  'rooms',
  'device_groups',
  'device_effect_targets',
  'automation_values',
  'profiles',
  'weather',
  'plugin_streams',
  'plugins',
  'devices',
]);

type KeyedChange = Exclude<Mirrored, { table: 'weather' | 'plugins' | 'devices' }>;

const UNKEYED: ReadonlySet<LiveChange['table']> = new Set(['weather', 'plugins', 'devices']);

function keyedChange(change: Mirrored): change is KeyedChange {
  return !UNKEYED.has(change.table);
}

function mirrored(change: LiveChange): change is Mirrored {
  return MIRRORED.has(change.table);
}

function pairKey(first: string, second: string): string {
  return `${first}\u0000${second}`;
}

function text(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function groupOrder(a: DeviceGroupRow, b: DeviceGroupRow): number {
  return text(a.name, b.name) || text(a.id, b.id);
}

function profileOrder(a: ProfileRow, b: ProfileRow): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  return text(a.created_at, b.created_at);
}

function found<T>(row: T | undefined, entity: string, id: string): T {
  if (row === undefined) throw new StoreNotFoundError(entity, id);
  return row;
}

export class WorldMirror implements WorldSource {
  private readonly roomRows = new Map<string, RoomRow>();
  private readonly groupRows = new Map<string, DeviceGroupRow>();
  private readonly effectRows = new Map<string, DeviceEffectTarget>();
  private readonly valueRows = new Map<string, AutomationValueRow>();
  private readonly profileRows = new Map<string, ProfileRow>();
  private readonly phoneRows = new Map<string, PhoneContextEntry>();
  private readonly streamRows = new Map<string, PluginStreamRow>();
  private readonly enabledPlugins = new Set<string>();
  private weatherRow: WeatherRow | null = null;
  private readonly vacuumLinks: VacuumLinkRows;
  private readonly pending: Mirrored[] = [];
  private loading: Promise<void> | null = null;
  private ready = false;

  readonly devices: WorldSource['devices'];
  readonly settings: WorldSource['settings'];
  readonly state: WorldSource['state'];

  readonly rooms: WorldSource['rooms'] = {
    byId: (id) => found(this.loaded(this.roomRows).get(id), 'room', id),
  };

  readonly deviceGroups: WorldSource['deviceGroups'] = {
    list: () => [...this.loaded(this.groupRows).values()].sort(groupOrder),
    byId: (id) => found(this.loaded(this.groupRows).get(id), 'device group', id),
  };

  readonly weather: WorldSource['weather'] = {
    read: () => {
      this.assertReady();
      if (this.weatherRow === null) throw new StoreNotFoundError('weather row', 'home');
      return this.weatherRow;
    },
  };

  readonly phoneContexts: WorldSource['phoneContexts'] = {
    byDevice: (deviceId) => this.loaded(this.phoneRows).get(deviceId),
    latestOf: (profileId) => {
      let latest: PhoneContextEntry | undefined;
      for (const entry of this.loaded(this.phoneRows).values())
        if (
          entry.profileId === profileId &&
          (latest === undefined || entry.reportedAt > latest.reportedAt)
        )
          latest = entry;
      return latest;
    },
  };

  readonly deviceEffects: WorldSource['deviceEffects'] = {
    find: (deviceId, capability) => this.loaded(this.effectRows).get(pairKey(deviceId, capability)),
  };

  readonly automationValues: WorldSource['automationValues'] = {
    byId: (id) => found(this.loaded(this.valueRows).get(id), 'automation value', id),
  };

  readonly profiles: WorldSource['profiles'] = {
    list: () => [...this.loaded(this.profileRows).values()].sort(profileOrder),
  };

  readonly pluginStreams: WorldSource['pluginStreams'] = {
    list: () =>
      [...this.loaded(this.streamRows).values()].filter((row) =>
        this.enabledPlugins.has(row.plugin_id),
      ),
  };

  readonly vacuumRooms: WorldSource['vacuumRooms'] = {
    linked: (deviceId) => {
      const rooms = this.loaded(this.roomRows);
      const linked = this.vacuumLinks.present(deviceId);
      return new Map([...linked].filter(([, roomId]) => rooms.has(roomId)));
    },
  };

  constructor(
    feed: ChangeFeed,
    private readonly host: StoreHost,
    private readonly home: HomeMirror,
  ) {
    this.devices = home.devices;
    this.settings = home.settings;
    this.state = { ofDevice: (deviceId): StateRow[] => home.state.ofDevice(deviceId) };
    this.vacuumLinks = new VacuumLinkRows(host);
    feed.subscribe((change) => {
      if (change.table === 'device_state' && change.record?.capability === VACUUM_ROOM_LINKS_KEY) {
        const deviceId = change.record.device_id;
        background(this.vacuumLinksChanged(deviceId), 'automation.world_vacuum_links_failed', {
          deviceId,
        });
        return;
      }
      if (!mirrored(change)) return;
      if (this.ready) this.apply(change);
      else if (this.loading !== null) this.pending.push(change);
    });
  }

  load(): Promise<void> {
    this.loading ??= this.fill();
    return this.loading;
  }

  async phoneReported(deviceId: string): Promise<void> {
    await this.load();
    const entry = await this.host.call('phoneContexts', 'byDevice', deviceId);
    if (entry === undefined) this.phoneRows.delete(deviceId);
    else this.phoneRows.set(deviceId, entry);
  }

  async vacuumLinksChanged(deviceId: string): Promise<void> {
    await this.load();
    await this.vacuumLinks.refresh(deviceId);
  }

  private loaded<T>(rows: T): T {
    this.assertReady();
    return rows;
  }

  private assertReady(): void {
    if (!this.ready) throw new WorldMirrorNotLoadedError();
  }

  private async fill(): Promise<void> {
    const [world] = await Promise.all([this.host.read('worldMirror', null), this.home.load()]);
    for (const room of world.rooms) this.roomRows.set(room.id, room);
    for (const group of world.groups) this.groupRows.set(group.id, group);
    for (const effect of world.effects)
      this.effectRows.set(pairKey(effect.device_id, effect.capability), effect);
    for (const value of world.values) this.valueRows.set(value.id, value);
    for (const profile of world.profiles) this.profileRows.set(profile.id, profile);
    for (const phone of world.phones) this.phoneRows.set(phone.deviceId, phone);
    this.vacuumLinks.fill(world.vacuumLinks);
    for (const stream of world.streams)
      this.streamRows.set(pairKey(stream.plugin_id, stream.stream), stream);
    for (const pluginId of world.enabledPlugins) this.enabledPlugins.add(pluginId);
    this.weatherRow = world.weather;
    for (const change of this.pending.splice(0)) this.apply(change);
    this.ready = true;
  }

  private apply(change: Mirrored): void {
    if (keyedChange(change)) {
      this.applyKeyed(change);
      return;
    }
    switch (change.table) {
      case 'weather':
        if (change.record !== null) this.weatherRow = change.record;
        return;
      case 'plugins':
        this.pluginChanged(change.record, change.oldRecord);
        return;
      case 'devices':
        if (change.record === null && change.oldRecord !== null)
          this.deviceRemoved(change.oldRecord.id);
        return;
    }
  }

  private applyKeyed(
    change: Exclude<Mirrored, { table: 'weather' | 'plugins' | 'devices' }>,
  ): void {
    switch (change.table) {
      case 'rooms':
        this.keyed(this.roomRows, change.record, change.oldRecord, (row) => row.id);
        return;
      case 'device_groups':
        this.keyed(this.groupRows, change.record, change.oldRecord, (row) => row.id);
        return;
      case 'automation_values':
        this.keyed(this.valueRows, change.record, change.oldRecord, (row) => row.id);
        return;
      case 'profiles':
        this.keyed(this.profileRows, change.record, change.oldRecord, (row) => row.id);
        return;
      case 'device_effect_targets':
        this.keyed(this.effectRows, change.record, change.oldRecord, (row) =>
          pairKey(row.device_id, row.capability),
        );
        return;
      case 'plugin_streams':
        this.keyed(this.streamRows, change.record, change.oldRecord, (row) =>
          pairKey(row.plugin_id, row.stream),
        );
        return;
    }
  }

  private keyed<T>(
    rows: Map<string, T>,
    record: T | null,
    oldRecord: T | null,
    keyOf: (row: T) => string,
  ): void {
    if (oldRecord !== null) rows.delete(keyOf(oldRecord));
    if (record !== null) rows.set(keyOf(record), record);
  }

  private pluginChanged(
    record: { readonly id: string; readonly enabled: boolean } | null,
    oldRecord: { readonly id: string; readonly enabled: boolean } | null,
  ): void {
    if (record === null) {
      if (oldRecord === null) return;
      this.enabledPlugins.delete(oldRecord.id);
      for (const [key, row] of this.streamRows)
        if (row.plugin_id === oldRecord.id) this.streamRows.delete(key);
      return;
    }
    if (record.enabled) this.enabledPlugins.add(record.id);
    else this.enabledPlugins.delete(record.id);
  }

  private deviceRemoved(deviceId: string): void {
    this.phoneRows.delete(deviceId);
    this.vacuumLinks.removed(deviceId);
    for (const [key, row] of this.effectRows)
      if (row.device_id === deviceId) this.effectRows.delete(key);
  }
}
