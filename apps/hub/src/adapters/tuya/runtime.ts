import type { AdapterSink, DiscoveredDevice, Unsubscribe } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import {
  discoveredDevice,
  eventsOf,
  remoteDevice,
  type LanAnnouncement,
  type ReportedValue,
  type TransportChoice,
} from '@smarteverything/tuya';
import type { RunContext } from '../contract';
import type { MessageStream, TuyaBackend } from './backend';
import type { LoadedRemote } from './cloud-inventory';
import type { TuyaDependencies } from './dependencies';
import { Learners, type LearnWait } from './learners';
import { LanListener } from './lan-listener';
import {
  LocalKeyRejectedError,
  LocalLink,
  LocalLinkUnavailableError,
  sameTarget,
  type LinkTarget,
} from './local-link';
import { linkTargetOf, planTransports, sameChoice } from './transport-plan';
import { routeCloudMessage } from './cloud-events';
import {
  TuyaDeviceUnknownError,
  reportOf,
  entryOf,
  recordOf,
  stateUpdates,
  withObserved,
  type DeviceRecord,
} from './records';
import { background, messageOf } from '@smarteverything/logging';

export interface RuntimeOptions {
  readonly backend: TuyaBackend;
  readonly dependencies: TuyaDependencies;
  readonly context: RunContext;
}

export interface LinkRoute {
  readonly link: LocalLink;
  readonly cid: string | null;
}

export class TuyaRuntime {
  readonly log: Logger;
  readonly learners = new Learners();
  private readonly records = new Map<string, DeviceRecord>();
  private readonly remotes = new Map<string, LoadedRemote>();
  private readonly lan = new Map<string, LanAnnouncement>();
  private readonly links = new Map<string, LocalLink>();
  private readonly choices = new Map<string, TransportChoice>();
  private readonly rejectedKeys = new Map<string, string>();
  private readonly refetching = new Set<string>();
  private sink: AdapterSink | null = null;
  private lanListener: LanListener | null = null;
  private messages: MessageStream | null = null;
  private resyncQueued = false;
  private resyncs: Promise<void> = Promise.resolve();

  constructor(readonly options: RuntimeOptions) {
    this.log = options.context.log;
  }

  get backend(): TuyaBackend {
    return this.options.backend;
  }

  async load(): Promise<void> {
    const inventory = await this.backend.loadInventory(this.log);
    const previous = new Map(this.records);
    this.records.clear();
    this.remotes.clear();
    for (const loaded of inventory.devices) {
      const observed = [...(previous.get(loaded.cloud.id)?.observed ?? [])];
      this.records.set(loaded.cloud.id, withObserved(recordOf(loaded), observed));
    }
    for (const loaded of inventory.remotes) {
      this.remotes.set(loaded.remote.remote_id, loaded);
    }
    this.log.info('tuya.inventory_loaded', {
      devices: this.records.size,
      remotes: this.remotes.size,
    });
    this.reconcile();
  }

  record(externalId: string): DeviceRecord | undefined {
    return this.records.get(externalId);
  }

  remote(externalId: string): LoadedRemote | undefined {
    return this.remotes.get(externalId);
  }

  choiceOf(deviceId: string): TransportChoice {
    const choice = this.choices.get(deviceId);
    if (choice === undefined) {
      throw new TuyaDeviceUnknownError(deviceId);
    }
    return choice;
  }

  route(record: DeviceRecord): LinkRoute {
    const linkId = record.cloud.sub ? record.cloud.gateway_id : record.cloud.id;
    const link = linkId === null ? undefined : this.links.get(linkId);
    if (link === undefined) {
      throw new LocalLinkUnavailableError(record.cloud.id);
    }
    return { link, cid: record.cloud.sub ? record.cloud.node_id : null };
  }

  learn(deviceId: string, timeoutMs: number): LearnWait {
    const record = this.records.get(deviceId);
    if (record?.model.ir === null || record === undefined) {
      throw new TuyaDeviceUnknownError(deviceId);
    }
    return this.learners.wait(deviceId, record.model.ir, timeoutMs);
  }

  devices(): readonly DiscoveredDevice[] {
    const devices = [...this.records.values()].map((record) =>
      discoveredDevice(
        entryOf(record),
        this.choiceOf(record.cloud.id),
        this.lan.get(record.cloud.id)?.version ?? null,
      ),
    );
    const remotes = [...this.remotes.values()].map((loaded) =>
      remoteDevice(loaded.blaster, loaded.remote, loaded.keys, loaded.room),
    );
    return [...devices, ...remotes];
  }

  async subscribe(sink: AdapterSink): Promise<Unsubscribe> {
    this.sink = sink;
    this.startMessages();
    await this.startLan(sink);
    this.reconcile();
    return (): Promise<void> => {
      this.stop();
      return Promise.resolve();
    };
  }

  private startMessages(): void {
    this.messages = this.backend.messages(this.log, (message) => {
      routeCloudMessage(this, message);
    });
    this.messages.start();
  }

  private async startLan(sink: AdapterSink): Promise<void> {
    this.lanListener = new LanListener({
      ports: this.options.dependencies.discoveryPorts,
      socket: this.options.dependencies.udpSocket,
      log: this.log,
      announced: (announcement): void => {
        this.onAnnouncement(announcement);
      },
    });
    try {
      await this.lanListener.start();
    } catch (cause) {
      sink.failure({ provider: 'tuya', externalId: null, operation: 'lan_discovery', cause });
    }
  }

  private stop(): void {
    this.sink = null;
    this.messages?.stop();
    this.lanListener?.stop();
    for (const link of this.links.values()) {
      link.stop();
    }
    this.links.clear();
    this.learners.cancelAll();
  }

  private chooseTransports(): boolean {
    const planned = planTransports({
      records: this.records,
      lan: this.lan,
      rejectedKeys: this.rejectedKeys,
    });
    let changed = false;
    for (const [deviceId, choice] of planned) {
      if (!sameChoice(this.choices.get(deviceId), choice)) {
        this.choices.set(deviceId, choice);
        this.log.info('tuya.transport_selected', { deviceId, ...choice });
        changed = true;
      }
    }
    return changed;
  }

  private reconcile(): void {
    const changed = this.chooseTransports();
    const sink = this.sink;
    if (sink === null) {
      return;
    }
    this.syncLinks();
    if (changed) {
      sink.devices(this.devices());
    }
  }

  private syncLinks(): void {
    for (const [deviceId, link] of this.links) {
      if (!this.records.has(deviceId)) {
        link.stop();
        this.links.delete(deviceId);
      }
    }
    for (const record of this.records.values()) {
      const target = linkTargetOf(
        record,
        this.choices.get(record.cloud.id),
        this.lan.get(record.cloud.id),
      );
      const link = this.links.get(record.cloud.id);
      if (target === null) {
        link?.stop();
        this.links.delete(record.cloud.id);
      } else if (link === undefined) {
        this.openLink(target);
      } else if (!sameTarget(link.current, target)) {
        link.replace(target);
      }
    }
  }

  private openLink(target: LinkTarget): void {
    const id = target.deviceId;
    const link = new LocalLink(target, {
      client: this.options.dependencies.localClient,
      port: this.options.dependencies.localPort,
      reconnectDelay: this.options.dependencies.timing.reconnectDelay,
      log: this.log,
      handlers: {
        report: (cid, dps, pushed): void => {
          this.onLocalReport(id, cid, dps, pushed);
        },
        connected: (): void => {
          this.onLinkState(id, 'device_online');
        },
        disconnected: (): void => {
          this.onLinkState(id, 'device_offline');
        },
        keyMismatch: (): void => {
          background(this.refetchKey(id), 'key.refetch_failed');
        },
      },
    });
    this.links.set(id, link);
    link.start();
  }

  private onAnnouncement(announcement: LanAnnouncement): void {
    if (!this.records.has(announcement.deviceId)) {
      this.log.debug('tuya.lan_device_unknown', { deviceId: announcement.deviceId });
      return;
    }
    const previous = this.lan.get(announcement.deviceId);
    if (previous?.ip === announcement.ip && previous.version === announcement.version) {
      return;
    }
    this.lan.set(announcement.deviceId, announcement);
    this.log.info('tuya.lan_device_seen', { ...announcement });
    this.reconcile();
  }

  presence(
    deviceId: string,
    kind: 'device_online' | 'device_offline',
    transport: 'local' | 'cloud',
  ): void {
    const at = new Date(this.options.dependencies.now()).toISOString();
    this.sink?.event({ externalId: deviceId, kind, occurredAt: at, details: { transport } });
  }

  private onLinkState(linkId: string, kind: 'device_online' | 'device_offline'): void {
    this.presence(linkId, kind, 'local');
    if (kind === 'device_online') {
      this.querySubDevices(linkId);
    }
  }

  private querySubDevices(linkId: string): void {
    const link = this.links.get(linkId);
    for (const record of this.records.values()) {
      const cid = record.cloud.node_id;
      if (
        link !== undefined &&
        cid !== null &&
        record.cloud.gateway_id === linkId &&
        this.choices.get(record.cloud.id)?.transport === 'local'
      ) {
        link
          .query(cid)
          .then((dps) => {
            this.onLocalReport(linkId, cid, dps, false);
          })
          .catch((cause: unknown) => {
            this.log.warn('tuya.sub_device_query_failed', {
              deviceId: record.cloud.id,
              reason: messageOf(cause),
            });
          });
      }
    }
  }

  private subDevice(linkId: string, cid: string): DeviceRecord | undefined {
    return [...this.records.values()].find(
      (record) => record.cloud.gateway_id === linkId && record.cloud.node_id === cid,
    );
  }

  private onLocalReport(
    linkId: string,
    cid: string | null,
    dps: Readonly<Record<string, unknown>>,
    pushed: boolean,
  ): void {
    const found = cid === null ? this.records.get(linkId) : this.subDevice(linkId, cid);
    if (found === undefined) {
      this.log.debug('tuya.local_report_unrouted', { linkId, cid });
      return;
    }
    this.applyDataPoints(found, dps, pushed);
  }

  applyDataPoints(
    found: DeviceRecord,
    dps: Readonly<Record<string, unknown>>,
    pushed: boolean,
  ): void {
    const record = withObserved(found, Object.keys(dps).map(Number));
    this.records.set(record.cloud.id, record);
    const { report, unknownDpIds } = reportOf(record, dps, this.log);
    if (unknownDpIds.length > 0) {
      this.log.debug('tuya.data_points_unpublished', {
        deviceId: record.cloud.id,
        dpIds: unknownDpIds,
      });
    }
    this.applyReport(record, report, pushed);
  }

  resync(): void {
    if (this.resyncQueued) {
      return;
    }
    this.resyncQueued = true;
    this.resyncs = this.resyncs.then(() => this.resyncNow());
  }

  private async resyncNow(): Promise<void> {
    this.resyncQueued = false;
    const sink = this.sink;
    if (sink === null) {
      return;
    }
    try {
      await this.load();
      sink.devices(this.devices());
    } catch (cause) {
      sink.failure({ provider: 'tuya', externalId: null, operation: 'resync', cause });
    }
  }

  applyReport(record: DeviceRecord, report: readonly ReportedValue[], pushed: boolean): void {
    const at = new Date(this.options.dependencies.now()).toISOString();
    const sink = this.sink;
    if (sink !== null) {
      for (const update of stateUpdates(record, report, at, this.log)) {
        sink.state(update);
      }
      for (const event of pushed ? eventsOf(record.cloud.id, report, at) : []) {
        sink.event(event);
      }
    }
    this.learners.offer(record.cloud.id, report);
  }

  private async refetchKey(linkId: string): Promise<void> {
    const record = this.records.get(linkId);
    if (record === undefined || this.refetching.has(linkId)) {
      return;
    }
    this.refetching.add(linkId);
    this.log.warn('tuya.local_key_mismatch', { deviceId: linkId });
    try {
      const [fresh] = await this.backend.devicesById([linkId]);
      if (fresh !== undefined && fresh.local_key !== record.cloud.local_key) {
        this.records.set(linkId, { ...record, cloud: fresh });
        this.log.info('tuya.local_key_updated', { deviceId: linkId });
      } else {
        this.rejectedKeys.set(linkId, record.cloud.local_key ?? '');
        this.sink?.failure({
          provider: 'tuya',
          externalId: linkId,
          operation: 'local_key',
          cause: new LocalKeyRejectedError(linkId),
        });
      }
      this.reconcile();
    } catch (cause) {
      this.sink?.failure({
        provider: 'tuya',
        externalId: linkId,
        operation: 'local_key_refresh',
        cause,
      });
    } finally {
      this.refetching.delete(linkId);
    }
  }
}
