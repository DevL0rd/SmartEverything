import { setTimeout as sleep } from 'node:timers/promises';
import { CommandRefusedError, type DeviceCommand, type JsonValue } from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import type { DeviceDriverContext } from '../../../local/device-driver';
import { Backoff } from '../../backoff';
import type { PluginContext, PluginStop } from '../contract';
import { DeviceMirror } from '../device-mirror';
import { ControllerModel, type PreparedCommand } from './controller-model';
import {
  OPENRGB_DRIVER_ID,
  describeUnit,
  unitReadings,
  type UnitSnapshot,
} from './controller-device';
import type { LightStep } from './light-plan';
import { recordLookMemory } from './look-memory';
import type { OpenRgbSettings } from './settings';
import { openRgbTools } from './tools';
import {
  connectOpenRgb,
  type OpenRgbConnector,
  type OpenRgbLink,
  type Unsubscribe,
} from './transport';

export type OpenRgbHost = Pick<
  PluginContext<OpenRgbSettings>,
  'settings' | 'signal' | 'log' | 'tools' | 'records'
> & {
  readonly devices: Pick<PluginContext<OpenRgbSettings>['devices'], 'register'>;
};

const NOT_CONNECTED =
  'OpenRGB is not connected. Start its SDK server and check the plugin settings.';

export interface OpenRgbOptions {
  readonly connect: OpenRgbConnector;
  readonly pause: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

const DEFAULT_OPTIONS: OpenRgbOptions = {
  connect: connectOpenRgb,
  pause: (milliseconds, signal) => sleep(milliseconds, undefined, { signal }),
};

class OpenRgbNotConnectedError extends Error {
  override readonly name = 'OpenRgbNotConnectedError';

  constructor() {
    super(NOT_CONNECTED);
  }
}

class OpenRgbProfileMissingError extends Error {
  override readonly name = 'OpenRgbProfileMissingError';

  constructor(
    readonly profile: string,
    readonly available: readonly string[],
  ) {
    super(`OpenRGB has no profile named ${profile}. It has: ${available.join(', ')}.`);
  }
}

function mirrorOf(externalId: string): DeviceMirror<UnitSnapshot> {
  return new DeviceMirror<UnitSnapshot>({
    externalId,
    describe: describeUnit,
    readings: unitReadings,
    observedAt: (snapshot) => snapshot.at,
    sampled: null,
  });
}

async function perform(link: OpenRgbLink, controller: number, step: LightStep): Promise<void> {
  if (step.kind === 'mode') {
    await link.setMode(controller, step.name, step.colours);
  } else if (step.zone === null) {
    link.setLeds(controller, step.colours);
  } else {
    link.setZoneLeds(controller, step.zone, step.colours);
  }
}

export class OpenRgbRuntime {
  private readonly model: ControllerModel;
  private readonly mirrors = new Map<string, DeviceMirror<UnitSnapshot>>();
  private readonly lifetime = new AbortController();
  private readonly signal: AbortSignal;
  private sink: DeviceDriverContext['sink'] | null = null;
  private link: OpenRgbLink | null = null;
  private online = false;
  private reading: Promise<void> | null = null;
  private readAgain = false;

  constructor(
    private readonly ctx: OpenRgbHost,
    private readonly options: OpenRgbOptions = DEFAULT_OPTIONS,
  ) {
    this.model = new ControllerModel(recordLookMemory(ctx.records('looks')));
    this.signal = AbortSignal.any([ctx.signal, this.lifetime.signal]);
  }

  start(): PluginStop {
    const unregister = this.ctx.devices.register({
      id: OPENRGB_DRIVER_ID,
      start: (driver) => this.attach(driver),
      execute: (command) => this.execute(command),
    });
    this.ctx.tools.register(
      openRgbTools({
        status: () => this.status(),
        loadProfile: (name) => this.loadProfile(name),
        saveProfile: (name) => this.saveProfile(name),
      }),
    );
    const running = this.run();
    return async () => {
      unregister();
      this.lifetime.abort();
      this.link?.close();
      await running;
    };
  }

  private attach(driver: DeviceDriverContext): Promise<() => Promise<void>> {
    this.sink = driver.sink;
    for (const mirror of this.mirrors.values()) {
      mirror.attach(driver.sink);
    }
    this.publish();
    return Promise.resolve(() => {
      this.sink = null;
      for (const mirror of this.mirrors.values()) {
        mirror.detach();
      }
      return Promise.resolve();
    });
  }

  private async run(): Promise<void> {
    const backoff = new Backoff();
    while (!this.stopped()) {
      await this.session(backoff);
      this.setOnline(false);
      if (this.stopped()) {
        return;
      }
      await this.options
        .pause(backoff.nextDelay(Date.now()), this.signal)
        .catch((cause: unknown) => {
          if (!this.stopped()) {
            throw cause;
          }
        });
    }
  }

  private async session(backoff: Backoff): Promise<void> {
    const { host, port } = this.ctx.settings;
    let link: OpenRgbLink;
    backoff.started(Date.now());
    try {
      link = await this.options.connect({ host, port }, this.ctx.log);
    } catch (cause) {
      this.ctx.log.warn('openrgb.connect_failed', { reason: messageOf(cause) });
      return;
    }
    this.link = link;
    try {
      await this.serve(link);
    } finally {
      this.link = null;
      link.close();
    }
  }

  private serve(link: OpenRgbLink): Promise<void> {
    return new Promise<void>((resolve) => {
      const stops: Unsubscribe[] = [];
      const finish = (): void => {
        for (const stop of stops) {
          stop();
        }
        this.signal.removeEventListener('abort', finish);
        resolve();
      };
      stops.push(
        link.onListUpdated(() => {
          this.reload(link);
        }),
        link.onClosed(finish),
      );
      this.signal.addEventListener('abort', finish, { once: true });
      this.reload(link);
    });
  }

  private reload(link: OpenRgbLink): void {
    if (this.reading !== null) {
      this.readAgain = true;
      return;
    }
    this.reading = this.readAll(link)
      .catch((cause: unknown) => {
        if (!this.stopped()) {
          this.ctx.log.warn('openrgb.read_failed', { reason: messageOf(cause) });
        }
        link.close();
      })
      .finally(() => {
        this.reading = null;
      });
  }

  private async readAll(link: OpenRgbLink): Promise<void> {
    let again = true;
    while (again) {
      this.readAgain = false;
      const controllers = await link.controllers();
      if (this.link !== link) {
        return;
      }
      this.model.replace(controllers);
      this.online = true;
      this.publish();
      again = this.pendingRead();
    }
  }

  private pendingRead(): boolean {
    return this.readAgain;
  }

  private stopped(): boolean {
    return this.signal.aborted;
  }

  private setOnline(online: boolean): void {
    if (this.online === online) {
      return;
    }
    this.online = online;
    this.publish();
  }

  private publish(): void {
    const at = new Date().toISOString();
    for (const snapshot of this.model.snapshots(this.online, at)) {
      const id = snapshot.unit.externalId;
      let mirror = this.mirrors.get(id);
      if (mirror === undefined) {
        mirror = mirrorOf(id);
        if (this.sink !== null) {
          mirror.attach(this.sink);
        }
        this.mirrors.set(id, mirror);
      }
      mirror.update(snapshot);
    }
  }

  private connected(capability: string): OpenRgbLink {
    if (this.link === null || !this.online) {
      throw new CommandRefusedError(capability, NOT_CONNECTED);
    }
    return this.link;
  }

  private async execute(command: DeviceCommand): Promise<JsonValue> {
    const link = this.connected(command.capability);
    const prepared = this.model.prepare(command);
    await this.perform(link, prepared);
    prepared.commit();
    this.publish();
    return { success: true };
  }

  private async perform(link: OpenRgbLink, prepared: PreparedCommand): Promise<void> {
    try {
      for (const step of prepared.steps) {
        await perform(link, prepared.index, step);
      }
    } catch (cause) {
      this.reload(link);
      throw cause;
    }
  }

  private async status(): Promise<Readonly<Record<string, JsonValue>>> {
    const link = this.link;
    const profiles = link === null || !this.online ? [] : await link.profiles();
    return {
      connected: this.online,
      lights: this.model.snapshots(this.online, new Date().toISOString()).map((snapshot) => ({
        externalId: snapshot.unit.externalId,
        name: snapshot.unit.name,
        online: snapshot.online,
        on: snapshot.state.on,
        brightness: snapshot.state.look.brightness,
        effect: snapshot.effect,
      })),
      profiles: [...profiles],
    };
  }

  private async loadProfile(name: string): Promise<void> {
    const link = this.requireLink();
    const profiles = await link.profiles();
    if (!profiles.includes(name)) {
      throw new OpenRgbProfileMissingError(name, profiles);
    }
    link.loadProfile(name);
    this.reload(link);
  }

  private saveProfile(name: string): Promise<void> {
    this.requireLink().saveProfile(name);
    return Promise.resolve();
  }

  private requireLink(): OpenRgbLink {
    if (this.link === null || !this.online) {
      throw new OpenRgbNotConnectedError();
    }
    return this.link;
  }
}

export function startOpenRgb(ctx: OpenRgbHost): PluginStop {
  return new OpenRgbRuntime(ctx).start();
}
