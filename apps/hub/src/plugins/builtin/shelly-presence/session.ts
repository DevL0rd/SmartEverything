import { ApiError } from '@smarteverything/domain';
import {
  SHELLY_DEVICE_INFO,
  type ShellyAction,
  type ShellyDevice,
  type ShellyTransportTls,
} from '@smarteverything/shelly';
import {
  ShellyAuthenticationError,
  type ShellyNotification,
  type ShellyRpc,
} from '@smarteverything/shelly/rpc';
import { z } from 'zod';
import { Backoff } from '../../backoff';
import type { DeviceDriverContext, PluginRecords } from '../contract';
import { readShellyInventory } from './component-inventory';
import { failureConnection, openShellyRpc } from './connection';
import { ShellyCrossings } from './crossings';
import { saveEnrollment, type ShellyEnrollment } from './enrollment';
import type { ShellyHttpOptions } from './http';
import {
  configurationChanged,
  notificationSnapshot,
  shellyEvents,
  type ShellyEvent,
} from './notifications';
import { sensorTransition } from './component-events';
import { applyNotificationEffects } from './notification-effects';
import { executeShelly, type ExecutionHost } from './execute';
import type { ShellyOutcome, ShellyRequest } from './operate';
import type { OperationPorts } from './ports';
import { shellyDevices, projectShellyReadings } from './projector';
import { readShellyResource, type ShellyResource } from './resources';
import { publishShellyInventory, rememberedShelly, rememberShelly } from './session-publication';
import { shellySnapshot } from './snapshot';
import { ShellyTracking } from './tracking';
import type { ShellyParams } from './wire';
import { listedMethod } from './wire';
import { reconcileZoneIdentities, resetZoneIdentities } from './zone-identities';

const RECONNECT_LONGEST_MS = 30_000;

export interface ShellySessionOptions {
  readonly enrollment: ShellyEnrollment;
  readonly password: string | null;
  readonly tls: ShellyTransportTls | null;
  readonly setPassword: (password: string | null) => Promise<string | null>;
  readonly enrollments: PluginRecords;
  readonly snapshots: PluginRecords;
  readonly inventoryChanged: (reindex: boolean) => void;
  readonly tracksChanged: (sensor: ShellyDevice) => void;
}

export class ShellySession {
  private enrollment: ShellyEnrollment;
  private password: string | null;
  private snapshot: ShellyDevice;
  private rpc: ShellyRpc | null = null;
  private context: DeviceDriverContext | null = null;
  private generation = 0;
  private wanted = false;
  private rerun = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private syncing: Promise<void> | null = null;
  private executing: Promise<unknown> = Promise.resolve();
  private readonly backoff = new Backoff(RECONNECT_LONGEST_MS);
  private readonly buffered: ShellyNotification[] = [];
  private readonly crossings = new ShellyCrossings();
  private readonly call: OperationPorts['call'] = (method, params, schema) =>
    this.connected().call(listedMethod(this.snapshot.methods, method), params, schema);
  private readonly tracking = new ShellyTracking(this.call, (cause) => {
    this.failure('live_view', cause);
  });

  constructor(private readonly options: ShellySessionOptions) {
    this.enrollment = options.enrollment;
    this.password = options.password;
    this.snapshot = rememberedShelly(options.snapshots, options.enrollment);
  }

  current(): ShellyDevice {
    return this.snapshot;
  }

  start(context: DeviceDriverContext): void {
    this.context = context;
    this.wanted = true;
    this.options.inventoryChanged(false);
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
    this.cancelRetry();
    this.release({ state: 'paused', reason: null }, false);
    this.context = null;
    this.syncing = null;
  }

  refresh(): Promise<void> {
    if (this.syncing !== null) {
      this.rerun = true;
      return this.syncing;
    }
    const run = this.synchronizeUntilSettled().finally(() => {
      if (this.syncing === run) this.syncing = null;
    });
    this.syncing = run;
    return run;
  }

  async reconnect(): Promise<void> {
    this.generation += 1;
    this.rpc?.close();
    this.rpc = null;
    this.cancelRetry();
    try {
      await this.connect();
    } catch (cause) {
      this.disconnected(cause, this.generation);
      throw cause;
    }
  }

  startTracking(holder: string): Promise<{ readonly enabled: boolean }> {
    return this.online()
      ? this.tracking.hold(holder)
      : Promise.resolve(this.tracking.remember(holder));
  }

  stopTracking(holder: string): Promise<{ readonly enabled: boolean }> {
    return (
      this.online() ? this.tracking.release(holder) : Promise.resolve(this.tracking.forget(holder))
    ).then((state) => this.untracked(state));
  }

  releaseClient(clientId: string): void {
    const released = this.online()
      ? this.tracking.releaseClient(clientId)
      : Promise.resolve(this.tracking.forgetClient(clientId));
    released
      .then((state) => this.untracked(state))
      .catch((cause: unknown) => {
        this.failure('live_view', cause);
      });
  }

  private untracked(state: { readonly enabled: boolean }): { readonly enabled: boolean } {
    if (!state.enabled && this.snapshot.tracksAt !== null) {
      this.snapshot = { ...this.snapshot, tracks: [], tracksAt: null };
      this.options.tracksChanged(this.snapshot);
    }
    return state;
  }

  async readResource(resource: ShellyResource): Promise<ShellyDevice> {
    const values = await readShellyResource(this.call, resource);
    this.snapshot = { ...this.snapshot, resources: { ...this.snapshot.resources, ...values } };
    this.options.inventoryChanged(false);
    return { ...this.snapshot, resources: values };
  }

  execute(request: ShellyRequest): Promise<ShellyOutcome> {
    const pending = this.executing.then(() => executeShelly(this.host(), request));
    // eslint-disable-next-line local/no-swallowed-errors -- the caller receives the same failure from the request
    this.executing = pending.catch(() => undefined);
    return pending;
  }

  private host(): ExecutionHost {
    return {
      ports: {
        device: () => this.snapshot,
        http: (): ShellyHttpOptions => ({
          address: this.enrollment.address,
          id: this.snapshot.id,
          password: this.password,
          signal: this.signal(),
          tls: this.options.tls,
        }),
        call: this.call,
        refresh: () => this.refresh(),
        reconnect: () => this.reconnect(),
      },
      resources: () => this.snapshot.resources,
      revision: () => this.snapshot.revision,
      readResource: (resource) => this.readResource(resource),
      prepare: (action): void => {
        if (action === 'bthome_discover')
          this.snapshot = { ...this.snapshot, discoveredBthome: [] };
      },
      acknowledge: (action, params) => this.acknowledge(action, params),
      authenticationFailed: (cause): void => {
        this.disconnected(cause, this.generation);
      },
      failure: (operation, cause): void => {
        this.failure(operation, cause);
      },
    };
  }

  private async acknowledge(action: ShellyAction, params: ShellyParams): Promise<void> {
    if (action === 'device_reset' && params['target'] === 'factory')
      this.enrollment = resetZoneIdentities(this.options.enrollments, this.enrollment);
    if (action === 'device_password') {
      const { password } = z.object({ password: z.string().nullable() }).parse(params);
      this.password = password;
      const secret = await this.options.setPassword(password);
      this.enrollment = { ...this.enrollment, secret };
      saveEnrollment(this.options.enrollments, this.enrollment);
      this.rpc?.setPassword(password);
    }
  }

  private online(): boolean {
    return this.rpc !== null && this.snapshot.connection.state === 'online';
  }

  private connected(): ShellyRpc {
    if (this.rpc === null) throw new ApiError('conflict', 'The sensor is offline.');
    return this.rpc;
  }

  private signal(): AbortSignal {
    return this.context === null ? AbortSignal.abort() : this.context.signal;
  }

  private cancelRetry(): void {
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
  }

  private release(connection: ShellyDevice['connection'], announce: boolean): void {
    const before = this.snapshot;
    this.rpc?.close();
    this.rpc = null;
    this.tracking.suspend();
    this.snapshot = { ...before, connection, tracks: [], tracksAt: null, discoveredBthome: [] };
    if (this.context !== null) {
      if (announce) sensorTransition(this.context.sink, before, this.snapshot);
      for (const device of shellyDevices(this.snapshot))
        this.context.sink.online(device.externalId, false);
      projectShellyReadings(this.context.sink, this.snapshot);
    }
    this.options.inventoryChanged(false);
    this.options.tracksChanged(this.snapshot);
  }

  private launch(): void {
    const generation = this.generation + 1;
    this.connect().catch((cause: unknown) => {
      this.disconnected(cause, generation);
    });
  }

  private async connect(): Promise<void> {
    const context = this.context;
    if (!this.wanted || context === null || context.signal.aborted) return;
    const generation = ++this.generation;
    this.backoff.started(Date.now());
    this.snapshot = { ...this.snapshot, connection: { state: 'connecting', reason: null } };
    this.options.inventoryChanged(false);
    const rpc = await openShellyRpc({
      address: this.enrollment.address,
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
    if (generation !== this.generation) {
      rpc.close();
      return;
    }
    this.rpc = rpc;
    this.enrollment = {
      ...this.enrollment,
      info: await rpc.call('Shelly.GetDeviceInfo', {}, SHELLY_DEVICE_INFO),
    };
    await this.refresh();
    if (generation !== this.generation) return;
    saveEnrollment(this.options.enrollments, this.enrollment);
    this.tracking.resume();
  }

  private async synchronizeUntilSettled(): Promise<void> {
    this.rerun = false;
    do {
      await this.synchronize();
    } while (this.takeRerun());
  }

  private takeRerun(): boolean {
    const again = this.rerun;
    this.rerun = false;
    return again;
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
    this.snapshot = {
      ...shellySnapshot(this.enrollment, inventory),
      ...(before.resources === undefined ? {} : { resources: before.resources }),
      discoveredBthome: before.discoveredBthome,
      tracks: before.tracks,
      tracksAt: before.tracksAt,
    };
    await publishShellyInventory(context, before, this.snapshot);
    sensorTransition(context.sink, before, this.snapshot);
    for (const notification of this.buffered.splice(0))
      this.applyNotification(notification, notification.sequence > inventory.statusSequence);
    rememberShelly(this.options.snapshots, this.snapshot);
    this.options.inventoryChanged(true);
  }

  private notification(notification: ShellyNotification): void {
    if (this.syncing !== null || this.snapshot.connection.state !== 'online') {
      this.buffered.push(notification);
      const changed = configurationChanged(notification, shellyEvents(notification), this.snapshot);
      if (changed && this.syncing !== null) this.rerun = true;
      return;
    }
    const events = this.applyNotification(notification, true);
    if (configurationChanged(notification, events, this.snapshot))
      this.refresh().catch((cause: unknown) => {
        this.failure('configuration_refresh', cause);
      });
  }

  private applyNotification(
    notification: ShellyNotification,
    updateState: boolean,
  ): readonly ShellyEvent[] {
    const context = this.context;
    const events = shellyEvents(notification);
    if (context === null) return events;
    const before = this.snapshot;
    try {
      const after = notificationSnapshot(before, notification, events, updateState);
      this.snapshot = after;
      applyNotificationEffects(
        {
          context,
          crossings: this.crossings,
          failure: (operation, cause) => {
            this.failure(operation, cause);
          },
          tracksChanged: this.options.tracksChanged,
          inventoryChanged: () => {
            this.options.inventoryChanged(false);
          },
        },
        before,
        after,
        events,
      );
    } catch (cause) {
      this.failure('notification', cause);
    }
    return events;
  }

  private disconnected(cause: unknown, generation: number): void {
    if (!this.wanted || generation !== this.generation) return;
    this.generation += 1;
    this.buffered.splice(0);
    this.release(failureConnection(cause), true);
    if (cause instanceof ShellyAuthenticationError || this.retry !== null) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      this.launch();
    }, this.backoff.nextDelay(Date.now()));
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
