import {
  COMPUTER_AI_SETTINGS,
  type ComputerAiCapabilities,
  type ComputerAiModel,
  type ComputerAiSettings,
  type ComputerRuntimeCapabilities,
  type ComputerRuntimeModel,
  type ComputerRuntimeSettings,
  type ComputerRuntimeTarget,
  type LiveChange,
} from '@smarteverything/domain';
import { StoreNotFoundError } from './context';
import type { ChangeFeed } from './feed';
import type { StoreHost } from './host/host';
import { storeUnit } from './host/unit';
import {
  aiCapabilitiesOf,
  aiModelsOf,
  aiSettingsOf,
  localAiSettings,
  storedAiDiscovery,
} from './repositories/computer-ai';
import {
  runtimeCapabilitiesOf,
  runtimeModelsOf,
  runtimeSettingsOf,
  storedRuntimeDiscovery,
  storedRuntimeSettings,
  type StoredComputerAi,
} from './repositories/computer-runtimes';

export class ComputerAiStateNotLoadedError extends Error {
  override readonly name = 'ComputerAiStateNotLoadedError';

  constructor() {
    super('The computer AI state was read before it was loaded from the store host.');
  }
}

export const COMPUTER_AI_STATE_UNIT = storeUnit((store, _input: null) => ({
  rows: store.computerRuntimes.rows(),
  devices: store.devices.list().map(({ id, kind }) => ({ id, kind })),
}));

const RUNTIMES = ['claude', 'codex'] as const;

function keyOf(target: ComputerRuntimeTarget): string {
  return `${target.device_id}\u0000${target.runtime}`;
}

function claude(deviceId: string): ComputerRuntimeTarget {
  return { device_id: deviceId, runtime: 'claude' };
}

type DeviceChange = Extract<LiveChange, { table: 'devices' }>;

export class ComputerAiState {
  private readonly rows = new Map<string, StoredComputerAi>();
  private readonly kinds = new Map<string, string>();
  private loading: Promise<void> | null = null;
  private ready = false;
  private localDevice: string | null = null;

  constructor(
    private readonly feed: ChangeFeed,
    private readonly host: StoreHost,
  ) {}

  load(): Promise<void> {
    this.loading ??= this.fill();
    return this.loading;
  }

  bindLocal(deviceId: string): void {
    this.localDevice = deviceId;
  }

  isLocal(deviceId: string): boolean {
    return this.localDevice === deviceId;
  }

  exists(deviceId: string): boolean {
    this.assertReady();
    return this.kinds.has(deviceId);
  }

  kind(deviceId: string): string {
    this.assertReady();
    const kind = this.kinds.get(deviceId);
    if (kind === undefined) throw new StoreNotFoundError('device', deviceId);
    return kind;
  }

  aiSettings(deviceId: string): ComputerAiSettings {
    return aiSettingsOf(this.stored(claude(deviceId)));
  }

  aiCapabilities(deviceId: string): ComputerAiCapabilities | null {
    return aiCapabilitiesOf(this.stored(claude(deviceId)));
  }

  aiModels(deviceId: string): ComputerAiModel[] {
    return aiModelsOf(this.stored(claude(deviceId)));
  }

  runtimeSettings(target: ComputerRuntimeTarget): ComputerRuntimeSettings {
    return runtimeSettingsOf(target, this.stored(target));
  }

  runtimeCapabilities(target: ComputerRuntimeTarget): ComputerRuntimeCapabilities | null {
    return runtimeCapabilitiesOf(target, this.stored(target));
  }

  runtimeModels(target: ComputerRuntimeTarget): ComputerRuntimeModel[] {
    return runtimeModelsOf(target, this.stored(target));
  }

  async saveAiSettings(deviceId: string, settings: ComputerAiSettings): Promise<void> {
    const parsed = COMPUTER_AI_SETTINGS.parse(settings);
    this.settingsSaved(claude(deviceId), parsed);
    await this.host.call('computerAi', 'saveSettings', deviceId, parsed);
  }

  async cacheAi(
    deviceId: string,
    capabilities: ComputerAiCapabilities,
    models: readonly ComputerAiModel[],
  ): Promise<void> {
    const target = claude(deviceId);
    this.discovered(
      target,
      aiSettingsOf(this.stored(target)),
      storedAiDiscovery(capabilities, models),
    );
    await this.host.call('computerAi', 'cache', deviceId, capabilities, [...models]);
  }

  async saveRuntimeSettings(
    target: ComputerRuntimeTarget,
    settings: ComputerRuntimeSettings,
  ): Promise<void> {
    const parsed = storedRuntimeSettings(target, settings);
    this.settingsSaved(target, parsed.settings);
    await this.host.call('computerRuntimes', 'saveSettings', target, parsed);
  }

  async cacheRuntime(
    target: ComputerRuntimeTarget,
    capabilities: ComputerRuntimeCapabilities,
    models: readonly ComputerRuntimeModel[],
  ): Promise<void> {
    this.discovered(
      target,
      runtimeSettingsOf(target, this.stored(target)).settings,
      storedRuntimeDiscovery(target, capabilities, models),
    );
    await this.host.call('computerRuntimes', 'cache', target, capabilities, [...models]);
  }

  async initialiseLocal(deviceId: string): Promise<void> {
    const chat = await this.host.call('assistantChat', 'settings');
    this.bindLocal(deviceId);
    if (this.stored(claude(deviceId)) !== undefined) return;
    await this.saveAiSettings(deviceId, localAiSettings(chat.claude_link_auto));
  }

  claimed(deviceId: string): void {
    if (this.ready) {
      this.ensureClaimed(deviceId);
      return;
    }
    if (this.loading === null) return;
    this.loading.then(
      () => {
        this.ensureClaimed(deviceId);
      },
      () => undefined,
    );
  }

  private ensureClaimed(deviceId: string): void {
    const target = claude(deviceId);
    if (this.stored(target) === undefined) this.settingsSaved(target, aiSettingsOf(undefined));
  }

  private settingsSaved(target: ComputerRuntimeTarget, settings: unknown): void {
    const existing = this.stored(target);
    this.rows.set(
      keyOf(target),
      existing === undefined
        ? { settings, capabilities: null, models: [] }
        : { ...existing, settings },
    );
  }

  private discovered(
    target: ComputerRuntimeTarget,
    settings: unknown,
    discovery: { readonly capabilities: unknown; readonly models: unknown },
  ): void {
    this.rows.set(keyOf(target), { settings, ...discovery });
  }

  private stored(target: ComputerRuntimeTarget): StoredComputerAi | undefined {
    this.assertReady();
    return this.rows.get(keyOf(target));
  }

  private assertReady(): void {
    if (!this.ready) throw new ComputerAiStateNotLoadedError();
  }

  private async fill(): Promise<void> {
    const pending: DeviceChange[] = [];
    let following = false;
    this.feed.subscribe((change) => {
      if (change.table !== 'devices') return;
      if (following) this.deviceChanged(change);
      else pending.push(change);
    });
    const state = await this.host.read('computerAiState', null);
    for (const row of state.rows)
      this.rows.set(keyOf(row), {
        settings: row.settings,
        capabilities: row.capabilities,
        models: row.models,
      });
    for (const device of state.devices) this.kinds.set(device.id, device.kind);
    for (const change of pending) this.deviceChanged(change);
    following = true;
    this.ready = true;
  }

  private deviceChanged(change: DeviceChange): void {
    if (change.record !== null) {
      this.kinds.set(change.record.id, change.record.kind);
      return;
    }
    if (change.oldRecord === null) return;
    const deviceId = change.oldRecord.id;
    this.kinds.delete(deviceId);
    for (const runtime of RUNTIMES) this.rows.delete(keyOf({ device_id: deviceId, runtime }));
  }
}
