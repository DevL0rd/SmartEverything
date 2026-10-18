import { mkdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import type { ProviderModule } from './adapters/contract';
import { createRegistry } from './adapters/registry';
import { go2rtcCameraMotor } from './adapters/xiaomi';
import { go2rtcClient, type Go2rtcClient, type Go2rtcMotor } from './cameras/go2rtc-client';
import { Go2rtcSupervisor, xiaomiLoginsOf } from './cameras/go2rtc-supervisor';
import type { Clock } from './clock';
import { FirewallMonitor } from './firewall/monitor';
import { observedGo2rtc } from './firewall/observed-go2rtc';
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
  readonly recordingPath: (storagePath: string) => string;
  readonly rtspPort: number;
}

async function startCameras(
  options: CoreOptions,
  store: Store,
  secrets: SecretStore,
  firewall: FirewallMonitor,
): Promise<{ supervisor: Go2rtcSupervisor; go2rtc: Go2rtcClient & Go2rtcMotor }> {
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
    reported: (text): void => {
      firewall.reported(text);
    },
  });
  const settings = store.settings.read();
  const running = await supervisor.start({
    xiaomi: xiaomiLoginsOf(secrets.read().accounts.xiaomi ?? null),
    candidates: settings.webrtc_candidates,
    iceServers: settings.ice_servers,
  });
  return { supervisor, go2rtc: observedGo2rtc(go2rtcClient({ ...running, fetch }), firewall) };
}

export async function startCore(
  options: CoreOptions,
  store: Store,
  secrets: SecretStore,
): Promise<Core> {
  const recordingPath = recordingPathIn(options.dataDirectory);
  await mkdir(join(options.dataDirectory, RECORDINGS_DIRECTORY), { recursive: true, mode: 0o700 });
  const firewall = new FirewallMonitor({
    system: options.firewall,
    webrtcPort: options.cameras.webrtcPort,
    now: options.clock.now,
    log: options.log.forArea('hub.firewall'),
  });
  const { supervisor, go2rtc } = await startCameras(options, store, secrets, firewall);
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
    devicesChanged: (devices): void => {
      firewall.devicesChanged(devices);
    },
    dataDirectory: options.dataDirectory,
    clock: options.clock,
    logFor: (area) => options.log.forArea(`hub.${area}`),
  }).catch(async (cause: unknown) => {
    firewall.stop();
    await supervisor.stop();
    throw cause;
  });
  return {
    hub,
    go2rtc,
    supervisor,
    firewall,
    recordingPath,
    rtspPort: options.cameras.rtspPort,
  };
}
