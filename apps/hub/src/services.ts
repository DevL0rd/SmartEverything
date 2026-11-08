import { randomBytes } from 'node:crypto';
import { resolve, sep } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import type { ProviderModule } from './adapters/contract';
import type { HubLayout } from './data-layout';
import { createRegistry } from './adapters/registry';
import { go2rtcCameraMotor } from './adapters/xiaomi';
import { CameraHealth, reconnectingProbe, type CameraFault } from './cameras/camera-health';
import { go2rtcClient, type Go2rtcClient, type Go2rtcMotor } from './cameras/go2rtc-client';
import { Go2rtcSupervisor, xiaomiLoginsOf } from './cameras/go2rtc-supervisor';
import type { Clock } from './clock';
import { FirewallApplier } from './firewall/apply';
import { GoogleChannels } from './google/channels';
import { GoogleLink } from './google/link';
import { GooglePushReceiver } from './google/push-receiver';
import { GoogleSyncRunner } from './google/sync-runner';
import { GoogleTokens } from './google/tokens';
import { GoogleCalendarSync } from './planner/google/calendar-sync';
import { TasksSync } from './planner/google/tasks-sync';
import { PlannerRuntime } from './planner/runtime';
import type { FetchLike } from './plugins/builtin/fetch-like';
import { FirewallMonitor, type DeviceMacs } from './firewall/monitor';
import { CameraLoad, observedGo2rtc } from './firewall/observed-go2rtc';
import { cameraSourceOf } from './state/inventory';
import type { FirewallSystem } from './firewall/system';
import type { ModuleRegistry } from './providers/registry-types';
import { startHub, type RunningHub } from './hub';
import type { SecretStore } from './secrets/store';
import { storeDatabase } from './store/hub-database';
import type { Store } from './store/store';
import type { VacuumVideoPorts } from './vacuum/video-session';

class RecordingPathError extends Error {
  override readonly name = 'RecordingPathError';

  constructor(storagePath: string) {
    super(`The recording path ${storagePath} leaves the recordings directory.`);
  }
}

export function recordingPathIn(layout: HubLayout): (storagePath: string) => string {
  return (storagePath) => {
    const [deviceId = '', ...rest] = storagePath.split('/');
    const root = resolve(layout.home.recordings(deviceId));
    const path = resolve(root, ...rest);
    if (rest.length === 0 || !path.startsWith(`${root}${sep}`)) {
      throw new RecordingPathError(storagePath);
    }
    return path;
  };
}

interface CameraOptions {
  readonly binary: string;
  readonly apiPort: number;
  readonly rtspPort: number;
  readonly webrtcPort: number;
}

export interface CoreOptions {
  readonly layout: HubLayout;
  readonly cameras: CameraOptions;
  readonly smartthings: ProviderModule<'smartthings'>;
  readonly modules: ModuleRegistry | null;
  readonly firewall: FirewallSystem;
  readonly clock: Clock;
  readonly fetch: FetchLike;
  readonly log: Logger;
  readonly fatal: (cause: Error) => void;
}

const GOOGLE_CHANNEL_KEY = 'google.push_channel_key';

const GOOGLE_CHANNEL_KEY_BYTES = 32;

export interface GoogleHub {
  readonly link: GoogleLink;
  readonly runner: GoogleSyncRunner;
  readonly channels: GoogleChannels;
  readonly receiver: GooglePushReceiver;
  readonly tasks: TasksSync;
  readonly stop: () => void;
}

export interface GoogleOptions {
  readonly store: Store;
  readonly secrets: SecretStore;
  readonly fetch: FetchLike;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly key: Uint8Array;
}

export async function googleChannelKey(secrets: SecretStore): Promise<Buffer> {
  const stored = secrets.apiKey(GOOGLE_CHANNEL_KEY);
  if (stored !== null) return Buffer.from(stored, 'hex');
  const key = randomBytes(GOOGLE_CHANNEL_KEY_BYTES);
  await secrets.saveApiKey(GOOGLE_CHANNEL_KEY, key.toString('hex'));
  return key;
}

export function startGoogle(options: GoogleOptions): GoogleHub {
  const { store, secrets, fetch: send, clock, key } = options;
  const tokens = new GoogleTokens({
    secrets,
    accounts: store.googleAccounts,
    fetch: send,
    nowMs: (): number => clock.now().getTime(),
  });
  const tasks = new TasksSync({
    fetch: send,
    accessToken: (profileId): Promise<string> => tokens.accessToken(profileId),
    items: store.plannerItems,
    collections: store.plannerCollections,
    states: store.googleSyncState,
    log: store.googleSyncLog,
    now: (): string => clock.now().toISOString(),
  });
  const runner = new GoogleSyncRunner({
    store,
    calendar: new GoogleCalendarSync({ store, tokens, fetch: send, now: clock.now }),
    tasks,
    clock,
  });
  const channels = new GoogleChannels({ store, tokens, runner, fetch: send, clock, key });
  channels.start();
  runner.start();
  return {
    link: new GoogleLink({ secrets, accounts: store.googleAccounts, tokens, fetch: send }),
    runner,
    channels,
    receiver: new GooglePushReceiver({ states: store.googleSyncState, runner, key }),
    tasks,
    stop: (): void => {
      runner.stop();
      channels.stop();
    },
  };
}

export function xiaomiStreamOf(store: Store): (did: string) => string | null {
  return (did) => {
    const device = store.devices.byExternal('xiaomi', did);
    return device === undefined ? null : (store.cameras.find(device.id)?.stream_name ?? null);
  };
}

export interface Core {
  readonly hub: RunningHub;
  readonly google: GoogleHub;
  readonly planner: PlannerRuntime;
  readonly go2rtc: Go2rtcClient;
  readonly supervisor: Go2rtcSupervisor;
  readonly firewall: FirewallMonitor;
  readonly firewallApplier: FirewallApplier;
  readonly cameraHealth: CameraHealth;
  readonly recordingPath: (storagePath: string) => string;
  readonly rtspPort: number;
}

interface HealthParts {
  readonly store: Store;
  readonly firewall: FirewallMonitor;
  readonly raw: Go2rtcClient;
  readonly load: CameraLoad;
}

function healthOf(options: CoreOptions, parts: HealthParts): CameraHealth {
  const { store, firewall, raw, load } = parts;
  const health = new CameraHealth({
    faultOf: (deviceId): CameraFault =>
      firewall.blockingAddress(deviceId) === null ? 'camera' : 'firewall',
    probe: reconnectingProbe(raw, (deviceId) => {
      const device = store.devices.find(deviceId);
      return device === undefined ? null : cameraSourceOf(device);
    }),
    load: (deviceId): Readonly<Record<string, number>> => load.of(deviceId),
    now: options.clock.now,
    log: options.log.forArea('hub.cameras'),
  });
  health.onChange((deviceId, down) => {
    if (down === null) {
      firewall.cameraRecovered(deviceId);
    } else {
      firewall.cameraFailed(deviceId);
    }
  });
  return health;
}

interface StartedCameras {
  readonly supervisor: Go2rtcSupervisor;
  readonly go2rtc: Go2rtcClient & Go2rtcMotor;
  readonly vacuumVideo: VacuumVideoPorts;
  readonly health: CameraHealth;
}

async function startCameras(
  options: CoreOptions,
  store: Store,
  secrets: SecretStore,
  firewall: FirewallMonitor,
): Promise<StartedCameras> {
  const log = options.log.forArea('hub.go2rtc');
  const supervisor = new Go2rtcSupervisor({
    binary: options.cameras.binary,
    configPath: options.layout.system.run.go2rtcConfig,
    apiPort: options.cameras.apiPort,
    rtspPort: options.cameras.rtspPort,
    webrtcPort: options.cameras.webrtcPort,
    log,
    exited: (cause): void => {
      log.exception('go2rtc.exited', cause);
      options.fatal(cause);
    },
  });
  const settings = store.settings.read();
  const running = await supervisor.start({
    xiaomi: xiaomiLoginsOf(secrets.read().accounts.xiaomi ?? null),
    candidates: settings.webrtc_candidates,
    iceServers: settings.ice_servers,
  });
  const raw = go2rtcClient({ ...running, fetch });
  const load = new CameraLoad();
  const health = healthOf(options, { store, firewall, raw, load });
  const go2rtc = observedGo2rtc(raw, {
    load,
    refusal: (deviceId) => health.refusal(deviceId),
    failed: (deviceId) => {
      health.failed(deviceId);
    },
    recovered: (deviceId) => {
      health.recovered(deviceId);
    },
    blockingAddress: (deviceId) => firewall.blockingAddress(deviceId),
  });
  const vacuumVideo: VacuumVideoPorts = {
    client: raw,
    blockingAddress: (deviceId) => firewall.blockingAddress(deviceId),
  };
  return { supervisor, go2rtc, health, vacuumVideo };
}

function deviceMacsOf(store: Store, now: () => Date): DeviceMacs {
  return {
    all: () => store.deviceMacs.all(),
    remember: (deviceId, mac): void => {
      store.deviceMacs.remember(deviceId, mac, now().toISOString());
    },
  };
}

function firewallOf(
  options: CoreOptions,
  store: Store,
): {
  readonly firewall: FirewallMonitor;
  readonly firewallApplier: FirewallApplier;
} {
  const log = options.log.forArea('hub.firewall');
  const firewall = new FirewallMonitor({
    system: options.firewall,
    macs: deviceMacsOf(store, options.clock.now),
    webrtcPort: options.cameras.webrtcPort,
    now: options.clock.now,
    log,
  });
  return {
    firewall,
    firewallApplier: new FirewallApplier({ system: options.firewall, monitor: firewall, log }),
  };
}

interface HubInputs {
  readonly store: Store;
  readonly secrets: SecretStore;
  readonly recordingPath: (storagePath: string) => string;
  readonly firewall: FirewallMonitor;
  readonly started: StartedCameras;
}

function plannerOf(
  options: CoreOptions,
  store: Store,
  hub: RunningHub,
  google: GoogleHub,
): PlannerRuntime {
  return new PlannerRuntime({
    store,
    clock: options.clock,
    signals: hub.signals,
    submit: hub.submit,
    google: google.runner,
    log: options.log.forArea('hub.planner'),
  });
}

async function runningHubOf(options: CoreOptions, inputs: HubInputs): Promise<RunningHub> {
  const { store, secrets, recordingPath, firewall, started } = inputs;
  const { supervisor, go2rtc, health } = started;
  return startHub({
    store,
    database: storeDatabase(store, recordingPath),
    accountChanged: (provider, account) =>
      provider === 'xiaomi'
        ? supervisor.apply({ xiaomi: xiaomiLoginsOf(account) })
        : Promise.resolve(false),
    registry:
      options.modules ??
      createRegistry(options.smartthings, go2rtcCameraMotor(go2rtc, xiaomiStreamOf(store))),
    secrets,
    go2rtc,
    vacuumVideo: started.vacuumVideo,
    cameraRefusal: (deviceId) => health.refusal(deviceId),
    devicesChanged: (devices): void => {
      firewall.devicesChanged(devices);
    },
    layout: options.layout,
    clock: options.clock,
    logFor: (area) => options.log.forArea(`hub.${area}`),
  }).catch(async (cause: unknown) => {
    firewall.stop();
    health.stop();
    await supervisor.stop();
    throw cause;
  });
}

export async function startCore(
  options: CoreOptions,
  store: Store,
  secrets: SecretStore,
): Promise<Core> {
  const channelKey = await googleChannelKey(secrets);
  const recordingPath = recordingPathIn(options.layout);
  const { firewall, firewallApplier } = firewallOf(options, store);
  const started = await startCameras(options, store, secrets, firewall);
  const hub = await runningHubOf(options, { store, secrets, recordingPath, firewall, started });
  const google = startGoogle({
    store,
    secrets,
    fetch: options.fetch,
    clock: options.clock,
    key: channelKey,
  });
  const planner = plannerOf(options, store, hub, google);
  return {
    hub: {
      ...hub,
      stop: async (): Promise<void> => {
        google.stop();
        await hub.stop();
      },
    },
    google,
    planner,
    go2rtc: started.go2rtc,
    supervisor: started.supervisor,
    firewall,
    firewallApplier,
    cameraHealth: started.health,
    recordingPath,
    rtspPort: options.cameras.rtspPort,
  };
}
