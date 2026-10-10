import {
  CommandRefusedError,
  type AdapterSink,
  type DeviceCommand,
  type DiscoveredDevice,
  type JsonValue,
  type ProviderAdapter,
  type StateUpdate,
  type Unsubscribe,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import {
  BEACON_KEY_PATH,
  DEVICE_LIST_PATH,
  beaconKeyData,
  parseBeaconKey,
  cameraFeatures,
  chooseTransport,
  deviceListData,
  isCameraModel,
  parseDeviceList,
  parseToken,
  type SourceList,
} from '@smarteverything/xiaomi';
import { CameraEventPoller } from './camera-events';
import type { CameraMotor } from './camera-motor';
import type { XiaomiCloud } from './cloud-api';
import type { XiaomiDependencies } from './dependencies';
import { cloudIo, lanIo } from './device-io';
import { seconds, type Opened } from './device-link';
import { DeviceRunner, type RunnerContext } from './device-runner';
import { XiaomiHealthCloud } from './health-cloud';
import { discoveredDevice, fetchInventory, type InventoryEntry } from './inventory';
import { MiioClient } from './miio-client';
import type { SpecStore } from './spec-store';

const VIRTUAL_DID_BYTES = 8;

export interface XiaomiAdapterOptions {
  readonly dependencies: XiaomiDependencies;
  readonly cloud: XiaomiCloud;
  readonly specs: SpecStore;
  readonly userId: string;
  readonly motor: CameraMotor | null;
  readonly log: Logger;
}

class LanTokenMissingError extends Error {
  override readonly name = 'LanTokenMissingError';

  constructor(did: string, host: string) {
    super(`The device ${did} answers at ${host}, but the hub holds no LAN token for it.`);
  }
}

export interface BluetoothIdentity {
  readonly mac: string;
  readonly bindKey: string;
}

class BluetoothAddressMissingError extends Error {
  override readonly name = 'BluetoothAddressMissingError';

  constructor(did: string) {
    super(`The Xiaomi device list has no Bluetooth address for ${did}.`);
  }
}

function virtualDidOf(bytes: Uint8Array): bigint {
  return bytes.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n) >> 1n;
}

export class XiaomiAdapter implements ProviderAdapter {
  readonly provider = 'xiaomi';
  private runners = new Map<string, DeviceRunner>();
  private cameras: { readonly did: string; readonly poller: CameraEventPoller }[] = [];
  private devices = new Map<string, DiscoveredDevice>();
  private sink: AdapterSink | null = null;
  private readonly virtualDid: bigint;

  constructor(private readonly options: XiaomiAdapterOptions) {
    this.virtualDid = virtualDidOf(options.dependencies.randomBytes(VIRTUAL_DID_BYTES));
  }

  readonly discover = async (): Promise<readonly DiscoveredDevice[]> => {
    const { cloud, specs, log, motor } = this.options;
    const entries = await fetchInventory({ cloud, specs, log, cameraMotor: motor !== null });
    await this.stopRunning();
    for (const entry of entries) {
      const opened = await this.open(entry);
      const runner = new DeviceRunner(entry, opened, this.runnerContext());
      await runner.loadPtzPositions();
      this.runners.set(entry.cloud.did, runner);
    }
    this.cameras = entries
      .filter((entry) => isCameraModel(entry.cloud.model))
      .map((entry) => this.cameraPoller(entry));
    this.rebuild();
    if (this.sink !== null) {
      this.startRunning();
    }
    const transports = [...this.runners.values()].map(
      (runner) => runner.transportState().transport,
    );
    log.info('xiaomi_inventory.discovered', {
      devices: entries.length,
      lan: transports.filter((transport) => transport === 'lan').length,
      cloud: transports.filter((transport) => transport === 'cloud').length,
      cameras: this.cameras.length,
    });
    return [...this.devices.values()];
  };

  readonly subscribe = async (sink: AdapterSink): Promise<Unsubscribe> => {
    this.sink = sink;
    this.startRunning();
    return Promise.resolve(async () => {
      this.sink = null;
      await this.stopRunning();
    });
  };

  readonly execute = async (command: DeviceCommand): Promise<JsonValue> => {
    const runner = this.runners.get(command.externalId);
    const device = this.devices.get(command.externalId);
    if (runner === undefined || device === undefined) {
      throw new CommandRefusedError(
        command.capability,
        `no Xiaomi device ${command.externalId} is known to this hub`,
      );
    }
    return runner.execute(command, device);
  };

  readonly refresh = async (externalIds: readonly string[]): Promise<readonly StateUpdate[]> => {
    const updates: StateUpdate[] = [];
    for (const externalId of externalIds) {
      const runner = this.runners.get(externalId);
      if (runner !== undefined) {
        try {
          updates.push(...(await runner.readAll()).all);
        } catch (error) {
          this.options.log.warn('xiaomi_device.refresh_failed', {
            did: externalId,
            reason: String(error),
          });
        }
      }
    }
    return updates;
  };

  private runnerContext(): RunnerContext {
    const { dependencies, cloud, log } = this.options;
    return {
      sink: () => this.sink,
      log,
      now: dependencies.now,
      jitter: dependencies.jitter,
      timing: dependencies.timing,
      virtualDid: this.virtualDid,
      openCloud: (did) => cloudIo(did, cloud),
      openLan: (did, host): Promise<MiioClient> => {
        const token = this.runners.get(did)?.entry.cloud.token ?? null;
        if (token === null) {
          throw new LanTokenMissingError(did, host);
        }
        return this.connect(host, token);
      },
      locate: (did) => this.locate(did),
      motor: this.options.motor,
      devicesChanged: (): void => {
        this.rebuild();
        this.updateCameraTriggers();
        this.sink?.devices([...this.devices.values()]);
      },
      cameraDetection: (did): void => {
        const sink = this.sink;
        const camera = this.cameras.find((candidate) => candidate.did === did);
        if (sink !== null && camera !== undefined) {
          camera.poller.detected(sink, dependencies.timing.cameraFollowUpMs);
        }
      },
    };
  }

  async bluetoothIdentity(did: string): Promise<BluetoothIdentity> {
    const page = parseDeviceList(await this.options.cloud.call(DEVICE_LIST_PATH, deviceListData()));
    const mac = page.devices.find((candidate) => candidate.did === did)?.mac ?? null;
    if (mac === null) {
      throw new BluetoothAddressMissingError(did);
    }
    const bindKey = parseBeaconKey(
      did,
      await this.options.cloud.call(BEACON_KEY_PATH, beaconKeyData(did)),
    );
    return { mac, bindKey };
  }

  async wearables(): Promise<SourceList> {
    const { dependencies, cloud, log } = this.options;
    return new XiaomiHealthCloud(dependencies, cloud.account, log).wearables();
  }

  private async locate(did: string): Promise<string | null> {
    const page = parseDeviceList(await this.options.cloud.call(DEVICE_LIST_PATH, deviceListData()));
    const device = page.devices.find((candidate) => candidate.did === did);
    return device === undefined || chooseTransport(device).transport === 'cloud' ? null : device.ip;
  }

  private async connect(host: string, token: string): Promise<MiioClient> {
    const { dependencies, log } = this.options;
    const client = new MiioClient({
      host,
      port: dependencies.miioPort,
      token: parseToken(token),
      socket: dependencies.createSocket(),
      timing: dependencies.timing,
      now: dependencies.now,
      log,
    });
    try {
      await client.handshake();
      return client;
    } catch (error) {
      await client.close();
      throw error;
    }
  }

  private async open(entry: InventoryEntry): Promise<Opened> {
    const { cloud, log } = this.options;
    const choice = chooseTransport(entry.cloud);
    const { ip, token, did } = entry.cloud;
    const toCloud = (reason: string): Opened => ({
      host: null,
      client: null,
      io: cloudIo(did, cloud),
      reason,
    });
    if (choice.transport === 'cloud' || ip === null || token === null) {
      return toCloud(choice.reason);
    }
    try {
      const client = await this.connect(ip, token);
      return { host: ip, client, io: lanIo(did, client), reason: choice.reason };
    } catch (error) {
      log.warn('xiaomi_device.lan_unreachable', { did, reason: String(error) });
      return toCloud(`the LAN handshake with ${ip} failed: ${String(error)}`);
    }
  }

  private cameraPoller(entry: InventoryEntry): {
    readonly did: string;
    readonly poller: CameraEventPoller;
  } {
    const doorbell = entry.spec !== null && cameraFeatures(entry.spec, entry.cloud.model).doorbell;
    const source = { did: entry.cloud.did, model: entry.cloud.model, doorbell };
    const poller = new CameraEventPoller(
      source,
      this.options.cloud,
      this.options.dependencies.now,
      this.options.log,
    );
    return { did: entry.cloud.did, poller };
  }

  private rebuild(): void {
    const known = new Set(this.runners.keys());
    const account = { userId: this.options.userId, region: this.options.cloud.region };
    this.devices = new Map(
      [...this.runners.values()].map((runner) => {
        const device = discoveredDevice(runner.entry, runner.transportState(), account, known);
        const camera = this.cameras.find(({ did }) => did === runner.did);
        const events =
          camera === undefined ? {} : { cameraEvents: this.cameraEventsDetail(camera.poller) };
        return [
          runner.did,
          {
            ...device,
            capabilities: [...device.capabilities, ...runner.ptzCapabilities()],
            details: { ...device.details, ...events },
          },
        ];
      }),
    );
  }

  private cameraEventsDetail(poller: CameraEventPoller): string {
    const interval = seconds(this.options.dependencies.timing.cameraPollMs);
    return poller.trigger === 'lan-push'
      ? 'cloud event list, read when the camera pushes a detection over the LAN'
      : `cloud event list every ${interval} s: the camera has no LAN push subscription`;
  }

  private startRunning(): void {
    for (const runner of this.runners.values()) {
      runner.start();
    }
    this.updateCameraTriggers();
  }

  private updateCameraTriggers(): void {
    const sink = this.sink;
    if (sink === null) {
      return;
    }
    for (const { did, poller } of this.cameras) {
      const pushSource = this.runners.get(did)?.transportState().pushSource ?? null;
      if (pushSource === null) {
        poller.useTimer(sink, this.options.dependencies.timing.cameraPollMs);
      } else {
        poller.usePush();
      }
    }
  }

  private async stopRunning(): Promise<void> {
    for (const { poller } of this.cameras) {
      poller.stop();
    }
    const runners = [...this.runners.values()];
    this.runners = new Map();
    await Promise.all(runners.map((runner) => runner.close()));
  }
}
