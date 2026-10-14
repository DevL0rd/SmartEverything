import { savedShellyLog } from './log-files';
import { localShellyAction } from './local-actions';
import { ShellyFirmwareUpload } from './firmware-upload';
import { componentEvent, faultTransition, sensorTransition } from './component-events';
import { shellyLogs } from './http';
import { readShellyResource, type ShellyResource } from './read-resources';
import { specialShellyAction } from './special-actions';
import {
  ApiError,
  JSON_VALUE,
  SHELLY_DEVICE_INFO,
  type JsonValue,
  type ShellyPresenceAction,
  type ShellyPresenceDevice,
  type ShellyPresenceOutcome,
  type ShellyTransportTls,
} from '@smarteverything/domain';
import type { DeviceDriverContext } from '../../../local/device-driver';
import type { PluginRecords } from '../contract';
import { readShellyInventory, shellyInventoryUpdate } from './component-inventory';
import { saveEnrollment, type ShellyEnrollment } from './enrollment';
import { shellySnapshot } from './snapshot';
import { ShellyRpc } from './rpc';
import { ShellyAuthenticationError } from './rpc-auth';
import { shellyDevices } from './projector';
import { ShellyConnectionError } from './rpc-frames';
import type { ShellyNotification } from './rpc-frames';
import type { ShellyStateUpdate } from './notifications';
import { failureConnection } from './connection-state';
import { supportedMethod } from './action-plan';
import { compileShellyAction } from './action-compiler';
import { validateShellyAction } from './action-rules';
import { acceptedOutcome } from './operation-outcome';
import { configurationChanged, notificationSnapshot, shellyEvents } from './notifications';
import { projectShellyReadings } from './projector';
import { publishShellyInventory, rememberedShelly, rememberShelly } from './session-publication';
import { reconcileZoneIdentities, resetZoneIdentities } from './zone-identities';
import { ShellyCrossings } from './crossings';
import { ShellyLiveView } from './live-view';

const BUFFER_LIMIT = 512;
const RETRY_MAX_MS = 30000;
export interface ShellySessionOptions {
  readonly enrollment: ShellyEnrollment;
  readonly password: string | null;
  readonly tls: ShellyTransportTls | null;
  readonly setPassword: (password: string | null) => Promise<string | null>;
  readonly enrollments: PluginRecords;
  readonly snapshots: PluginRecords;
  readonly publish: (snapshot: ShellyPresenceDevice) => void;
}
export class ShellySession {
  private enrollment: ShellyEnrollment;
  private password: string | null;
  private snapshot: ShellyPresenceDevice;
  private rpc: ShellyRpc | null = null;
  private context: DeviceDriverContext | null = null;
  private generation = 0;
  private attempts = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private syncing: Promise<void> | null = null;
  private readonly buffered: ShellyNotification[] = [];
  private readonly crossings: ShellyCrossings;
  private live: ShellyLiveView | null = null;
  private readonly firmware = new ShellyFirmwareUpload(
    () => this.connected(),
    () => this.snapshot.methods,
  );
  private wanted = false;
  private executing: Promise<unknown> = Promise.resolve();
  constructor(private readonly options: ShellySessionOptions) {
    this.enrollment = options.enrollment;
    this.password = options.password;
    this.snapshot = rememberedShelly(options.snapshots, options.enrollment);
    this.crossings = new ShellyCrossings();
  }
  current(): ShellyPresenceDevice {
    return this.snapshot;
  }
  start(context: DeviceDriverContext): void {
    this.context = context;
    this.wanted = true;
    this.options.publish(this.snapshot);
    this.launch();
  }
  async pause(context: DeviceDriverContext): Promise<void> {
    this.context = context;
    this.snapshot = { ...this.snapshot, connection: { state: 'paused', reason: null } };
    await context.publishDevices(shellyDevices(this.snapshot));
    this.stop();
  }
  stop(): void {
    this.wanted = false;
    this.generation += 1;
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    this.live?.dispose();
    this.live = null;
    this.firmware.reset();
    this.rpc?.close();
    this.rpc = null;
    this.snapshot = {
      ...this.snapshot,
      connection: { state: 'paused', reason: null },
      tracks: [],
      tracksAt: null,
      discoveredBthome: [],
    };
    if (this.context !== null) {
      for (const device of shellyDevices(this.snapshot))
        this.context.sink.online(device.externalId, false);
      projectShellyReadings(this.context.sink, this.snapshot);
    }
    this.options.publish(this.snapshot);
    this.context = null;
    this.syncing = null;
  }
  async refresh(): Promise<void> {
    if (this.syncing !== null) return this.syncing;
    const pending = this.synchronize().finally(() => {
      if (this.syncing === pending) this.syncing = null;
    });
    this.syncing = pending;
    return pending;
  }
  async reconnect(): Promise<void> {
    this.generation += 1;
    this.rpc?.close();
    this.rpc = null;
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    await this.connect();
  }
  async setLiveView(
    holder: string,
    enabled: boolean,
  ): Promise<{ enabled: boolean; expiresAt: string | null; renewAfterMs: number | null }> {
    if (this.live === null) throw new ApiError('conflict', 'The sensor is not connected.');
    return this.live.set(holder, enabled);
  }
  async readResource(resource: ShellyResource): Promise<ShellyPresenceDevice> {
    const values = await readShellyResource(this.connected(), this.snapshot.methods, resource);
    this.snapshot = { ...this.snapshot, resources: { ...this.snapshot.resources, ...values } };
    this.options.publish(this.snapshot);
    return this.snapshot;
  }
  execute(action: ShellyPresenceAction): Promise<ShellyPresenceOutcome> {
    const pending = this.executing.then(() => this.executeAction(action));
    this.executing = pending.catch(() => undefined);
    return pending;
  }
  private async executeAction(action: ShellyPresenceAction): Promise<ShellyPresenceOutcome> {
    const local = await localShellyAction(action, {
      signal: this.signal(),
      refresh: () => this.refresh(),
      reconnect: () => this.reconnect(),
    });
    if (local !== undefined) return acceptedOutcome(this.snapshot, action, local);
    await this.refreshRevisionResource(action);
    validateShellyAction(this.snapshot, action);
    try {
      if (action.action === 'device_logs')
        return acceptedOutcome(this.snapshot, action, await this.logs(action.lines));
      if (action.action === 'bthome_discover')
        this.snapshot = { ...this.snapshot, discoveredBthome: [] };
      const special = await this.special(action);
      const result = special === undefined ? await this.runPlan(action) : special;
      const outcome = acceptedOutcome(this.snapshot, action, result);
      await this.acknowledge(action);
      if (action.action.startsWith('firmware_upload_'))
        return { ...outcome, readback: 'confirmed' };
      return await this.readback(action, outcome);
    } catch (cause) {
      if (cause instanceof ShellyAuthenticationError) this.disconnected(cause, this.generation);
      if (cause instanceof ShellyConnectionError)
        return { state: 'unknown', action: action.action, message: cause.message };
      throw cause;
    }
  }
  private async acknowledge(action: ShellyPresenceAction): Promise<void> {
    if (action.action === 'device_reset' && action.target === 'factory')
      this.enrollment = resetZoneIdentities(this.options.enrollments, this.enrollment);
    if (action.action === 'device_password') await this.storePassword(action.password);
  }
  private async special(action: ShellyPresenceAction): Promise<JsonValue | undefined> {
    const log = await savedShellyLog(action, {
      address: this.enrollment.address,
      id: this.snapshot.id,
      password: this.password,
      tls: this.options.tls,
      signal: this.signal(),
    });
    if (log !== undefined) return log;
    const firmware = await this.firmware.execute(action);
    if (firmware !== undefined) return firmware;
    return specialShellyAction(this.connected(), this.snapshot.methods, this.snapshot.id, action);
  }
  private async readback(
    action: ShellyPresenceAction,
    outcome: Extract<ShellyPresenceOutcome, { state: 'accepted' }>,
  ): Promise<ShellyPresenceOutcome> {
    try {
      await this.refresh();
      await this.refreshWrittenResource(action);
      return { ...outcome, revision: this.snapshot.revision, readback: 'confirmed' };
    } catch (cause) {
      this.failure('operation_readback', cause);
      return { ...outcome, readback: 'unavailable' };
    }
  }
  private signal(): AbortSignal {
    return this.context === null ? AbortSignal.abort() : this.context.signal;
  }
  private logs(lines: number): Promise<{ text: string }> {
    return shellyLogs(
      {
        address: this.enrollment.address,
        id: this.snapshot.id,
        password: this.password,
        tls: this.options.tls,
        signal: this.signal(),
      },
      lines,
    );
  }
  private async storePassword(password: string | null): Promise<void> {
    this.password = password;
    const secret = await this.options.setPassword(password);
    this.enrollment = { ...this.enrollment, secret };
    saveEnrollment(this.options.enrollments, this.enrollment);
    this.rpc?.setPassword(password);
  }
  private launch(): void {
    const generation = this.generation + 1;
    this.connect().catch((cause: unknown) => {
      this.disconnected(cause, generation);
    });
  }
  private async refreshWrittenResource(action: ShellyPresenceAction): Promise<void> {
    if (action.action.startsWith('schedule_')) await this.readResource('schedules');
    if (action.action.startsWith('webhook_')) await this.readResource('webhooks');
    if (action.action.startsWith('script_')) await this.readResource('scripts');
    if (action.action.startsWith('kvs_')) await this.readResource('storedValues');
  }
  private async refreshRevisionResource(action: ShellyPresenceAction): Promise<void> {
    if (action.action.startsWith('schedule_')) await this.readResource('schedules');
    if (action.action.startsWith('webhook_')) await this.readResource('webhooks');
  }
  private async runPlan(action: ShellyPresenceAction): Promise<JsonValue> {
    const plan = compileShellyAction(this.snapshot, action);
    return this.connected().call(
      supportedMethod(this.snapshot.methods, plan.method),
      plan.params,
      JSON_VALUE,
    );
  }
  private connected(): ShellyRpc {
    if (this.rpc === null) throw new ApiError('conflict', 'The sensor is offline.');
    return this.rpc;
  }
  private async connect(): Promise<void> {
    const context = this.context;
    if (!this.wanted || context === null || context.signal.aborted) return;
    const generation = ++this.generation;
    this.snapshot = { ...this.snapshot, connection: { state: 'connecting', reason: null } };
    this.options.publish(this.snapshot);
    const url = new URL('/rpc', this.enrollment.address);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const rpc = new ShellyRpc({
      url: url.toString(),
      id: this.enrollment.info.id,
      password: this.password,
      tls: this.options.tls,
      signal: context.signal,
      notification: (notification): void => {
        if (generation === this.generation) this.notification(notification);
      },
      closed: (cause): void => {
        this.disconnected(cause, generation);
      },
    });
    this.rpc = rpc;
    await rpc.open();
    const info = await rpc.call('Shelly.GetDeviceInfo', {}, SHELLY_DEVICE_INFO);
    this.enrollment = { ...this.enrollment, info };
    saveEnrollment(this.options.enrollments, this.enrollment);
    await this.refresh();
    if (generation !== this.generation) return;
    this.attempts = 0;
    this.live = new ShellyLiveView(
      () => this.connected(),
      info.ver,
      () => this.refresh(),
      (cause): void => {
        this.failure('live_view', cause);
      },
    );
  }
  private async synchronize(): Promise<void> {
    const rpc = this.connected();
    const context = this.context;
    const generation = this.generation;
    if (context === null) throw new ApiError('conflict', 'The Shelly driver is stopped.');
    const inventory = await readShellyInventory(rpc);
    if (generation !== this.generation) return;
    this.enrollment = reconcileZoneIdentities(this.options.enrollments, this.enrollment, inventory);
    const before = this.snapshot;
    const next = shellySnapshot(this.enrollment, inventory);
    this.snapshot = {
      ...next,
      ...(before.resources === undefined ? {} : { resources: before.resources }),
      discoveredBthome: before.discoveredBthome,
      tracks: before.tracks,
      tracksAt: before.tracksAt,
    };
    await publishShellyInventory(context, before, this.snapshot);
    sensorTransition(context.sink, before, this.snapshot);
    for (const notification of this.buffered.splice(0))
      this.applyNotification(notification, shellyInventoryUpdate(inventory, notification));
    rememberShelly(this.options.snapshots, this.snapshot);
    this.options.publish(this.snapshot);
  }
  private notification(notification: ShellyNotification): void {
    if (this.syncing !== null || this.snapshot.connection.state !== 'online') {
      if (this.buffered.length >= BUFFER_LIMIT) {
        this.rpc?.close();
        return;
      }
      this.buffered.push(notification);
      return;
    }
    this.applyNotification(notification);
    if (configurationChanged(notification, this.snapshot))
      this.refresh().catch((cause: unknown) => {
        this.failure('configuration_refresh', cause);
      });
  }
  private applyNotification(
    notification: ShellyNotification,
    updateState: ShellyStateUpdate = true,
  ): void {
    const context = this.context;
    if (context === null) return;
    const before = this.snapshot;
    this.snapshot = notificationSnapshot(this.snapshot, notification, updateState);
    faultTransition(context.sink, before, this.snapshot);
    for (const event of shellyEvents(notification)) {
      this.crossings.observe(context.publishEvent, this.snapshot, event).catch((cause: unknown) => {
        this.failure('crossing_commit', cause);
      });
      componentEvent(context.sink, this.snapshot, event);
    }
    projectShellyReadings(context.sink, this.snapshot);
    this.options.publish(this.snapshot);
  }
  private disconnected(cause: unknown, generation: number): void {
    if (!this.wanted || generation !== this.generation) return;
    const before = this.snapshot;
    const rpc = this.rpc;
    this.rpc = null;
    this.generation += 1;
    rpc?.close();
    this.live?.dispose();
    this.live = null;
    this.firmware.reset();
    this.buffered.splice(0);
    const reason = cause instanceof Error ? cause.message : 'The local sensor connection failed.';
    this.snapshot = {
      ...this.snapshot,
      connection: failureConnection(cause, reason),
      discoveredBthome: [],
      tracks: [],
      tracksAt: null,
    };
    if (this.context !== null) {
      sensorTransition(this.context.sink, before, this.snapshot);
      for (const device of shellyDevices(this.snapshot))
        this.context.sink.online(device.externalId, false);
      projectShellyReadings(this.context.sink, this.snapshot);
    }
    this.options.publish(this.snapshot);
    if (cause instanceof ShellyAuthenticationError || this.retry !== null) return;
    const delay = Math.min(1000 * 2 ** this.attempts++, RETRY_MAX_MS);
    this.retry = setTimeout(() => {
      this.retry = null;
      this.launch();
    }, delay);
    this.retry.unref();
  }
  private failure(operation: string, cause: unknown): void {
    this.context?.sink.failure({
      provider: 'local',
      externalId: this.snapshot.externalId,
      operation,
      cause,
    });
  }
}
