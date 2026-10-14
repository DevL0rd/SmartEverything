import { queuedShellyAction, validateQueuedShellyAction } from './queued-command';
import { shellySensitiveAction } from './action-sensitive';
import {
  ApiError,
  SHELLY_PRESENCE_OUTCOME,
  SHELLY_PRESENCE_OPERATION_CAPABILITY,
  SHELLY_PRESENCE_PLUGIN_ID,
  SHELLY_PRESENCE_STREAM,
  shellyPresenceExternalId,
  type DeviceCommand,
  type JsonValue,
  type ShellyPresenceAction,
  type ShellyPresenceDevice,
  type ShellyPresenceSnapshot,
  type ShellyPresenceOutcome,
} from '@smarteverything/domain';
import type { DeviceDriverContext } from '../../../local/device-driver';
import type { PluginContext, PluginStop } from '../contract';
import { jsonOf } from './action-plan';
import {
  enrollmentTls,
  enrollShelly,
  enrolledDevices,
  type SHELLY_ENROLL_INPUT,
  type ShellyEnrollment,
} from './enrollment';
import type { z } from 'zod';
import { ShellySession } from './session';
import type { ToolCaller } from '../../../ai-tools/hub-tool';
import { shellyTools } from './tools';
import { shellySearch } from './search';
import { shellyActionPermission } from './action-rules';
import type { ShellySettings } from './settings';
export class ShellyRuntime {
  private readonly sessions = new Map<string, ShellySession>();
  private driver: DeviceDriverContext | null = null;
  constructor(private readonly ctx: PluginContext<ShellySettings>) {}
  snapshot(): ShellyPresenceSnapshot {
    return {
      at: new Date().toISOString(),
      devices: [...this.sessions.values()].map((s) => publicSensor(s.current())),
      discovery: { state: 'idle', reason: null },
    };
  }
  start(): PluginStop {
    for (const enrollment of enrolledDevices(this.ctx.records('enrollments')))
      this.attach(enrollment);
    this.ctx.tools.register(
      shellyTools({
        signal: this.ctx.signal,
        snapshot: () => this.snapshot(),
        read: (id, resource) => this.session(id).readResource(resource),
        execute: (id, action, caller) => this.executeTool(id, action, caller),
        enroll: (input) => this.enroll(input),
        forget: (id) => this.forget(id),
        live: (id, holder, enabled) => this.session(id).setLiveView(holder, enabled),
      }),
    );
    const unregister = this.ctx.devices.register({
      id: SHELLY_PRESENCE_PLUGIN_ID,
      start: async (context) => {
        this.driver = context;
        for (const session of this.sessions.values()) {
          if (this.ctx.settings.paused) await session.pause(context);
          else session.start(context);
        }
        this.publish();
        return Promise.resolve(() => {
          for (const session of this.sessions.values()) session.stop();
          this.driver = null;
          return Promise.resolve();
        });
      },
      execute: (command) => this.command(command),
    });
    const unwatch = this.ctx.settingsChanged((settings) => {
      for (const session of this.sessions.values()) session.stop();
      if (!settings.paused && this.driver !== null)
        for (const session of this.sessions.values()) session.start(this.driver);
      this.publish();
    });
    this.publish();
    return () => {
      unwatch();
      unregister();
      for (const session of this.sessions.values()) session.stop();
      return Promise.resolve();
    };
  }
  private attach(enrollment: ShellyEnrollment): ShellySession {
    const previous = this.sessions.get(shellyPresenceExternalId(enrollment.info.id));
    previous?.stop();
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
      publish: (): void => {
        this.publish();
      },
    });
    this.sessions.set(shellyPresenceExternalId(enrollment.info.id), session);
    if (this.driver !== null && !this.ctx.settings.paused) session.start(this.driver);
    return session;
  }
  private session(id: string): ShellySession {
    const session = this.sessions.get(id);
    if (session === undefined)
      throw new ApiError('not_found', 'That configured Shelly sensor is not available.');
    return session;
  }
  private async enroll(input: z.output<typeof SHELLY_ENROLL_INPUT>): Promise<ShellyPresenceDevice> {
    const enrollment = await enrollShelly(input, this.ctx.records('enrollments'), this.ctx.secrets);
    const session = this.attach(enrollment);
    this.publish();
    return session.current();
  }
  private async forget(id: string): Promise<void> {
    const session = this.session(id);
    const sensor = session.current();
    session.stop();
    this.sessions.delete(id);
    const record = enrolledDevices(this.ctx.records('enrollments')).find(
      (e) => e.info.id === sensor.id,
    );
    if (record?.secret !== null && record?.secret !== undefined)
      await this.ctx.secrets.remove(record.secret);
    if (record?.tlsSecret !== null && record?.tlsSecret !== undefined)
      await this.ctx.secrets.remove(record.tlsSecret);
    this.ctx.records('enrollments').remove(sensor.id);
    this.ctx.records('snapshots').remove(sensor.id);
    await this.driver?.forget(
      [sensor.externalId, ...sensor.zones.filter((z) => !z.main).map((z) => z.externalId)].map(
        (external) => external.slice(SHELLY_PRESENCE_PLUGIN_ID.length + 1),
      ),
    );
    this.publish();
  }
  private async command(command: DeviceCommand): Promise<JsonValue> {
    const action = queuedShellyAction(
      this.session(command.externalId).current(),
      command,
      this.ctx.devices.valueOf(command.commandId),
    );
    validateQueuedShellyAction(command, action, this.ctx.devices.callerOf(command.commandId));
    return jsonOf(await this.session(command.externalId).execute(action));
  }
  private async executeTool(
    id: string,
    action: ShellyPresenceAction,
    caller: ToolCaller,
  ): Promise<ShellyPresenceOutcome> {
    if (shellyActionPermission(action) === 'read') return this.session(id).execute(action);
    return SHELLY_PRESENCE_OUTCOME.parse(
      await this.ctx.devices.command(
        {
          externalId: id,
          capability: SHELLY_PRESENCE_OPERATION_CAPABILITY,
          value: jsonOf(action),
          transient: shellySensitiveAction(action),
        },
        caller,
      ),
    );
  }
  private publish(): void {
    const snapshot = this.snapshot();
    this.ctx.data.publish(SHELLY_PRESENCE_STREAM, jsonOf(snapshot));
    this.ctx.search.replace(shellySearch(snapshot.devices));
  }
}
export function startShelly(ctx: PluginContext<ShellySettings>): Promise<PluginStop> {
  return Promise.resolve(new ShellyRuntime(ctx).start());
}

function publicSensor(sensor: ShellyPresenceDevice): ShellyPresenceDevice {
  if (sensor.resources === undefined) return sensor;
  const resources = { ...sensor.resources };
  delete resources.storedValues;
  return { ...sensor, resources };
}
