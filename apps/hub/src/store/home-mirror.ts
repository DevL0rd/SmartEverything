import type {
  AssistantSettings,
  CameraRow,
  DeviceRow,
  JsonValue,
  LiveChange,
  SettingsRow,
  StateRow,
  TalkChannelRow,
} from '@smarteverything/domain';
import type { ComputerAccessState } from './computer-access-state';
import { StoreNotFoundError } from './context';
import type { ChangeFeed } from './feed';
import type { StoreHost } from './host/host';
import { storeUnit } from './host/unit';

export class HomeMirrorNotLoadedError extends Error {
  override readonly name = 'HomeMirrorNotLoadedError';

  constructor() {
    super('The home mirror was read before it was loaded from the store host.');
  }
}

export const LISTENING_SWITCHES_KEY = 'listening.devices';

export const MIRRORED_SAVED_KEYS = [
  'reach.blocked_cameras',
  'reach.wake_off',
  'reach.speaker_standby_off',
  'reach.quiet',
  'reach.framing',
] as const;

export type MirroredSavedKey = (typeof MIRRORED_SAVED_KEYS)[number];

export const HOME_MIRROR_UNIT = storeUnit((store, _input: null) => ({
  devices: store.devices.list(),
  channels: store.talk.channels(),
  listening: store.settingsKv.read(LISTENING_SWITCHES_KEY),
  saved: MIRRORED_SAVED_KEYS.map((key) => ({ key, value: store.settingsKv.read(key) })),
  assistant: store.assistantChat.settings(),
  cameras: store.cameras.list(),
  state: store.state.list(),
  settings: store.settings.read(),
}));

function externalKey(provider: string, externalId: string): string {
  return `${provider}\u0000${externalId}`;
}

function deviceOrder(a: DeviceRow, b: DeviceRow): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

type Mirrored = Extract<
  LiveChange,
  | { table: 'devices' }
  | { table: 'cameras' }
  | { table: 'device_state' }
  | { table: 'settings' }
  | { table: 'talk_channels' }
>;

const MIRRORED: ReadonlySet<LiveChange['table']> = new Set([
  'devices',
  'cameras',
  'device_state',
  'settings',
  'talk_channels',
]);

function mirrored(change: LiveChange): change is Mirrored {
  return MIRRORED.has(change.table);
}

function channelOrder(a: TalkChannelRow, b: TalkChannelRow): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

type Saved = Readonly<Record<string, unknown>> | null;

export class HomeMirror {
  private readonly deviceRows = new Map<string, DeviceRow>();
  private readonly external = new Map<string, string>();
  private readonly cameraRows = new Map<string, CameraRow>();
  private readonly stateRows = new Map<string, Map<string, StateRow>>();
  private readonly channelRows = new Map<string, TalkChannelRow>();
  private settingsRow: SettingsRow | null = null;
  private listeningSaved: Saved = null;
  private readonly savedRows = new Map<MirroredSavedKey, Saved>();
  private assistantSaved: AssistantSettings | null = null;
  private readonly pending: Mirrored[] = [];
  private loading: Promise<void> | null = null;
  private ready = false;

  readonly devices = {
    list: (): DeviceRow[] => {
      this.assertReady();
      return [...this.deviceRows.values()].sort(deviceOrder);
    },
    find: (id: string): DeviceRow | undefined => {
      this.assertReady();
      return this.deviceRows.get(id);
    },
    byId: (id: string): DeviceRow => {
      const device = this.devices.find(id);
      if (device === undefined) throw new StoreNotFoundError('device', id);
      return device;
    },
    byExternal: (provider: string, externalId: string): DeviceRow | undefined => {
      this.assertReady();
      const id = this.external.get(externalKey(provider, externalId));
      return id === undefined ? undefined : this.deviceRows.get(id);
    },
  };

  readonly cameras = {
    list: (): CameraRow[] => {
      this.assertReady();
      return [...this.cameraRows.values()].sort((a, b) =>
        a.device_id < b.device_id ? -1 : a.device_id > b.device_id ? 1 : 0,
      );
    },
    find: (deviceId: string): CameraRow | undefined => {
      this.assertReady();
      return this.cameraRows.get(deviceId);
    },
    byDevice: (deviceId: string): CameraRow => {
      const camera = this.cameras.find(deviceId);
      if (camera === undefined) throw new StoreNotFoundError('camera', deviceId);
      return camera;
    },
  };

  readonly state = {
    value: (deviceId: string, capability: string): JsonValue | undefined => {
      this.assertReady();
      return this.stateRows.get(deviceId)?.get(capability)?.value;
    },
    ofDevice: (deviceId: string): StateRow[] => {
      this.assertReady();
      return [...(this.stateRows.get(deviceId)?.values() ?? [])].sort((a, b) =>
        a.capability < b.capability ? -1 : a.capability > b.capability ? 1 : 0,
      );
    },
  };

  readonly settings = {
    read: (): SettingsRow => {
      this.assertReady();
      if (this.settingsRow === null) throw new StoreNotFoundError('settings row', '1');
      return this.settingsRow;
    },
  };

  readonly talk = {
    channels: (): TalkChannelRow[] => {
      this.assertReady();
      return [...this.channelRows.values()].sort(channelOrder);
    },
  };

  readonly computerNodes = {
    personOf: (deviceId: string): string | null => {
      this.assertReady();
      return this.access.personOf(deviceId);
    },
  };

  readonly listening = {
    read: (): Saved => {
      this.assertReady();
      return this.listeningSaved;
    },
    save: async (settings: Readonly<Record<string, unknown>>): Promise<void> => {
      await this.load();
      this.listeningSaved = settings;
      await this.host.call('settingsKv', 'save', LISTENING_SWITCHES_KEY, settings);
    },
  };

  readonly saved = {
    read: (key: MirroredSavedKey): Saved => {
      this.assertReady();
      const value = this.savedRows.get(key);
      if (value === undefined) throw new HomeMirrorNotLoadedError();
      return value;
    },
    save: (key: MirroredSavedKey, settings: Readonly<Record<string, unknown>>): Promise<void> => {
      this.assertReady();
      this.savedRows.set(key, settings);
      return this.host.call('settingsKv', 'save', key, settings);
    },
  };

  readonly assistant = {
    read: (): AssistantSettings => {
      this.assertReady();
      if (this.assistantSaved === null) throw new HomeMirrorNotLoadedError();
      return this.assistantSaved;
    },
    save: async (settings: AssistantSettings): Promise<AssistantSettings> => {
      await this.load();
      await this.host.call('assistantChat', 'saveSettings', settings);
      this.assistantSaved = await this.host.call('assistantChat', 'settings');
      return this.assistantSaved;
    },
  };

  constructor(
    feed: ChangeFeed,
    private readonly host: StoreHost,
    private readonly access: ComputerAccessState,
  ) {
    feed.subscribe((change) => {
      if (!mirrored(change)) return;
      if (this.ready) this.apply(change);
      else if (this.loading !== null) this.pending.push(change);
    });
  }

  load(): Promise<void> {
    this.loading ??= this.fill();
    return this.loading;
  }

  private assertReady(): void {
    if (!this.ready) throw new HomeMirrorNotLoadedError();
  }

  private async fill(): Promise<void> {
    const [home] = await Promise.all([this.host.read('homeMirror', null), this.access.load()]);
    for (const device of home.devices) this.putDevice(device);
    for (const camera of home.cameras) this.cameraRows.set(camera.device_id, camera);
    for (const row of home.state) this.putState(row);
    this.settingsRow = home.settings;
    for (const channel of home.channels) this.channelRows.set(channel.id, channel);
    this.listeningSaved = home.listening;
    for (const { key, value } of home.saved) this.savedRows.set(key, value);
    this.assistantSaved = home.assistant;
    for (const change of this.pending.splice(0)) this.apply(change);
    this.ready = true;
  }

  private apply(change: Mirrored): void {
    switch (change.table) {
      case 'devices':
        this.deviceChanged(change.record, change.oldRecord);
        return;
      case 'cameras':
        this.cameraChanged(change.record, change.oldRecord);
        return;
      case 'device_state':
        this.stateChanged(change.record, change.oldRecord);
        return;
      case 'settings':
        if (change.record !== null) this.settingsRow = change.record;
        return;
      case 'talk_channels':
        this.channelChanged(change.record, change.oldRecord);
        return;
    }
  }

  private cameraChanged(record: CameraRow | null, oldRecord: CameraRow | null): void {
    if (record !== null) this.cameraRows.set(record.device_id, record);
    else if (oldRecord !== null) this.cameraRows.delete(oldRecord.device_id);
  }

  private stateChanged(record: StateRow | null, oldRecord: StateRow | null): void {
    if (record !== null) this.putState(record);
    else if (oldRecord !== null)
      this.stateRows.get(oldRecord.device_id)?.delete(oldRecord.capability);
  }

  private channelChanged(record: TalkChannelRow | null, oldRecord: TalkChannelRow | null): void {
    if (record !== null) this.channelRows.set(record.id, record);
    else if (oldRecord !== null) this.channelRows.delete(oldRecord.id);
  }

  private putState(row: StateRow): void {
    const rows = this.stateRows.get(row.device_id) ?? new Map<string, StateRow>();
    rows.set(row.capability, row);
    this.stateRows.set(row.device_id, rows);
  }

  private putDevice(device: DeviceRow): void {
    this.deviceRows.set(device.id, device);
    this.external.set(externalKey(device.provider, device.external_id), device.id);
  }

  private deviceChanged(record: DeviceRow | null, oldRecord: DeviceRow | null): void {
    if (oldRecord !== null)
      this.external.delete(externalKey(oldRecord.provider, oldRecord.external_id));
    if (record !== null) {
      this.putDevice(record);
      return;
    }
    if (oldRecord === null) return;
    this.deviceRows.delete(oldRecord.id);
    this.cameraRows.delete(oldRecord.id);
    this.stateRows.delete(oldRecord.id);
  }
}
