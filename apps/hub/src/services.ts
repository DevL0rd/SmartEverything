import { mkdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import type { ProviderModule } from './adapters/contract';
import { createRegistry } from './adapters/registry';
import { go2rtcCameraMotor } from './adapters/xiaomi';
import { CameraHealth, reconnectingProbe, type CameraFault } from './cameras/camera-health';
import { go2rtcClient, type Go2rtcClient, type Go2rtcMotor } from './cameras/go2rtc-client';
import { Go2rtcSupervisor, xiaomiLoginsOf } from './cameras/go2rtc-supervisor';
import type { Clock } from './clock';
import { FirewallApplier } from './firewall/apply';
import { FirewallMonitor } from './firewall/monitor';
import { CameraLoad, observedGo2rtc } from './firewall/observed-go2rtc';
import { cameraSourceOf } from './state/inventory';
import type { FirewallSystem } from './firewall/system';
import type { ModuleRegistry } from './providers/registry-types';
import { startHub, type RunningHub } from './hub';
import type { SecretStore } from './secrets/store';
import { storeDatabase } from './store/hub-database';
import type { Store } from './store/store';

const RECORDINGS_DIRECTORY = 'recordings';

class RecordingPathError extends Error {
  override readonly name = 'RecordingPathError';

  constructor(storagePath: string) {
    super(`The recording path ${storagePath} leaves the recordings directory.`);
  }
}

export function recordingPathIn(dataDirectory: string): (storagePath: string) => string {
  const root = resolve(dataDirectory, RECORDINGS_DIRECTORY);
  return (storagePath) => {
    const path = resolve(root, storagePath);
    if (!path.startsWith(`${root}${sep}`)) {
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
  readonly dataDirectory: string;
  readonly cameras: CameraOptions;
  readonly smartthings: ProviderModule<'smartthings'>;
  readonly modules: ModuleRegistry | null;
  readonly firewall: FirewallSystem;
  readonly clock: Clock;
  readonly log: Logger;
  readonly fatal: (cause: Error) => void;
}

export function xiaomiStreamOf(store: Store): (did: string) => string | null {
  return (did) => {
    const device = store.devices.byExternal('xiaomi', did);
    return device === undefined ? null : (store.cameras.find(device.id)?.stream_name ?? null);
  };
}

export interface Core {
  readonly hub: RunningHub;
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
    dataDirectory: options.dataDirectory,
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
  return { supervisor, go2rtc, health };
}

function firewallOf(options: CoreOptions): {
  readonly firewall: FirewallMonitor;
  readonly firewallApplier: FirewallApplier;
} {
  const log = options.log.forArea('hub.firewall');
  const firewall = new FirewallMonitor({
    system: options.firewall,
    webrtcPort: options.cameras.webrtcPort,
    now: options.clock.now,
    log,
  });
  return {
    firewall,
    firewallApplier: new FirewallApplier({ system: options.firewall, monitor: firewall, log }),
  };
}

export async function startCore(
  options: CoreOptions,
  store: Store,
  secrets: SecretStore,
): Promise<Core> {
  const recordingPath = recordingPathIn(options.dataDirectory);
  await mkdir(join(options.dataDirectory, RECORDINGS_DIRECTORY), { recursive: true, mode: 0o700 });
  const { firewall, firewallApplier } = firewallOf(options);
  const { supervisor, go2rtc, health } = await startCameras(options, store, secrets, firewall);
  const hub = await startHub({
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
    cameraRefusal: (deviceId) => health.refusal(deviceId),
    devicesChanged: (devices): void => {
      firewall.devicesChanged(devices);
    },
    dataDirectory: options.dataDirectory,
    clock: options.clock,
    logFor: (area) => options.log.forArea(`hub.${area}`),
  }).catch(async (cause: unknown) => {
    firewall.stop();
    health.stop();
    await supervisor.stop();
    throw cause;
  });
  return {
    hub,
    go2rtc,
    supervisor,
    firewall,
    firewallApplier,
    cameraHealth: health,
    recordingPath,
    rtspPort: options.cameras.rtspPort,
  };
}
