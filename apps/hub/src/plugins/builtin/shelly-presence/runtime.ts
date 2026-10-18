import { ApiError, type DeviceCommand, type JsonValue } from '@smarteverything/domain';
import {
  SHELLY_PLUGIN_ID,
  shellyExternalId,
  type ShellyDevice,
  type ShellySnapshot,
} from '@smarteverything/shelly';
import type { DeviceDriverContext, PluginStop } from '../contract';
import { watchShellyAddresses } from './address-watch';
import { shellyRequestOf } from './device-command';
import {
  enrollmentTls,
  enrollShelly,
  enrolledDevices,
  type ShellyEnrollInput,
  type ShellyEnrollment,
} from './enrollment';
import { publicSensor, ShellyPublisher } from './publisher';
import { ShellySession } from './session';
import type { ShellyContext } from './settings';
import { shellyTools } from './tools';
import { ViewerTracking } from './viewer-tracking';
import { jsonOf } from '../json-value';

class ShellyRuntime {
  private readonly sessions = new Map<string, ShellySession>();
  private readonly publisher: ShellyPublisher;
  private readonly viewing: ViewerTracking;
  private driver: DeviceDriverContext | null = null;

  constructor(private readonly ctx: ShellyContext) {
    this.publisher = new ShellyPublisher(ctx, () =>
      [...this.sessions.values()].map((session) => session.current()),
    );
    this.viewing = new ViewerTracking(ctx, (externalId) => this.sessions.get(externalId));
  }

  start(): PluginStop {
    for (const enrollment of enrolledDevices(this.ctx.records('enrollments')))
      this.attach(enrollment);
    this.ctx.tools.register(
      shellyTools({
        signal: this.ctx.signal,
        snapshot: () => this.snapshot(),
        read: (id, resource) => this.session(id).readResource(resource),
        execute: (id, request) => this.session(id).execute(request),
        enroll: (input) => this.enroll(input),
        forget: (id) => this.forget(id),
        track: (id, holder, enabled) =>
          enabled ? this.session(id).startTracking(holder) : this.session(id).stopTracking(holder),
      }),
    );
    const unregister = this.ctx.devices.register({
      id: SHELLY_PLUGIN_ID,
      start: (context) => this.drive(context),
      execute: async (command) => this.command(command),
    });
    const unwatch = this.ctx.settingsChanged((settings) => {
      for (const session of this.sessions.values()) session.stop();
      if (!settings.paused && this.driver !== null)
        for (const session of this.sessions.values()) session.start(this.driver);
      this.publisher.inventoryChanged(false);
    });
    const unwatchClients = this.ctx.clients.gone((clientId) => {
      for (const session of this.sessions.values()) session.releaseClient(clientId);
    });
    const stopAddresses = watchShellyAddresses(this.ctx, (enrollment) => this.attach(enrollment));
    this.publisher.inventoryChanged(true);
    return async () => {
      unwatch();
      unregister();
      unwatchClients();
      this.viewing.stop();
      for (const session of this.sessions.values()) session.stop();
      this.publisher.stop();
      await stopAddresses();
    };
  }

  private snapshot(): ShellySnapshot {
    return {
      at: new Date().toISOString(),
      devices: [...this.sessions.values()].map((session) => publicSensor(session.current())),
    };
  }

  private async drive(context: DeviceDriverContext): Promise<() => Promise<void>> {
    this.driver = context;
    for (const session of this.sessions.values()) {
      if (this.ctx.settings.paused) await session.pause(context);
      else session.start(context);
    }
    this.publisher.inventoryChanged(true);
    return () => {
      for (const session of this.sessions.values()) session.stop();
      this.driver = null;
      return Promise.resolve();
    };
  }

  private attach(enrollment: ShellyEnrollment): ShellySession {
    const key = shellyExternalId(enrollment.info.id);
    this.sessions.get(key)?.stop();
    const session = new ShellySession({
      enrollment,
      tls: enrollmentTls(enrollment, this.ctx.secrets),
      password: enrollment.secret === null ? null : this.ctx.secrets.get(enrollment.secret),
      enrollments: this.ctx.records('enrollments'),
      snapshots: this.ctx.records('snapshots'),
      setPassword: async (password): Promise<string | null> => {
        const name = enrollment.secret ?? `password_${enrollment.info.id}`;
        if (password === null) {
          await this.ctx.secrets.remove(name);
          return null;
        }
        await this.ctx.secrets.set(name, password);
        return name;
      },
      inventoryChanged: (reindex): void => {
        this.publisher.inventoryChanged(reindex);
      },
      tracksChanged: (sensor): void => {
        this.publisher.tracksChanged(sensor);
      },
    });
    this.sessions.set(key, session);
    this.viewing.watch(key);
    if (this.driver !== null && !this.ctx.settings.paused) session.start(this.driver);
    return session;
  }

  private session(id: string): ShellySession {
    const session = this.sessions.get(id);
    if (session === undefined)
      throw new ApiError('not_found', 'That configured Shelly sensor is not available.');
    return session;
  }

  private async enroll(input: ShellyEnrollInput): Promise<ShellyDevice> {
    const enrollment = await enrollShelly(input, this.ctx.records('enrollments'), this.ctx.secrets);
    const session = this.attach(enrollment);
    this.publisher.inventoryChanged(true);
    return session.current();
  }

  private async forget(id: string): Promise<void> {
    const session = this.session(id);
    const sensor = session.current();
    session.stop();
    this.sessions.delete(id);
    this.viewing.forget(id);
    const record = enrolledDevices(this.ctx.records('enrollments')).find(
      (entry) => entry.info.id === sensor.id,
    );
    for (const name of [record?.secret, record?.tlsSecret])
      if (typeof name === 'string') await this.ctx.secrets.remove(name);
    this.ctx.records('enrollments').remove(sensor.id);
    this.ctx.records('snapshots').remove(sensor.id);
    await this.driver?.forget(
      [
        sensor.externalId,
        ...sensor.zones.filter((zone) => !zone.main).map((zone) => zone.externalId),
      ].map((external) => external.slice(SHELLY_PLUGIN_ID.length + 1)),
    );
    this.publisher.forget(sensor.id);
  }

  private async command(command: DeviceCommand): Promise<JsonValue> {
    const session = this.session(command.externalId);
    return jsonOf(await session.execute(shellyRequestOf(session.current(), command)));
  }
}

export function startShelly(ctx: ShellyContext): Promise<PluginStop> {
  return Promise.resolve(new ShellyRuntime(ctx).start());
}
