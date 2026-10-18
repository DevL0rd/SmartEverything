import {
  CommandRefusedError,
  TV_DIRECT_CODES,
  TV_KEY,
  TV_KEY_REASON_TEXT,
  tvKeyMap,
  tvPathsFor,
  tvValuesOf,
  type CommandRequest,
  type DeviceCommand,
  type JsonValue,
  type Provider,
  type ProviderAdapter,
  type TvDevice,
  type TvKey,
  type TvPaths,
  type TvRoute,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { failureLine } from '@smarteverything/logging';
import type { DeviceRecord } from '../database/port';
import type { AdapterDirectory } from './executor';

export interface TelevisionRoutingOptions {
  readonly adapters: AdapterDirectory;
  readonly valueOf: (deviceId: string, capability: string) => JsonValue | undefined;
  readonly attachedTo: () => string | null;
  readonly log: Logger;
}

function adapterOf(adapters: AdapterDirectory, provider: Provider): ProviderAdapter {
  const adapter = adapters.adapterFor(provider);
  if (adapter === undefined) {
    throw new CommandRefusedError('remote_key', `the ${provider} provider is not running`);
  }
  return adapter;
}

type Routes = readonly [TvRoute, ...TvRoute[]];

export class TelevisionRouting {
  constructor(private readonly options: TelevisionRoutingOptions) {}

  handles(device: DeviceRecord, command: DeviceCommand): boolean {
    if (device.provider !== 'smartthings' || device.kind !== 'television') {
      return false;
    }
    if (command.capability === 'remote_key') {
      return true;
    }
    return (
      (command.capability === 'power' || command.capability === 'app_launch') &&
      this.attachedTo(device) !== null
    );
  }

  async execute(device: DeviceRecord, command: DeviceCommand): Promise<JsonValue> {
    if (command.capability === 'app_launch') {
      return this.attempt(device, command, [
        { path: 'direct', send: this.requestOf(device, command) },
        { path: 'smartthings', send: this.requestOf(device, command) },
      ]);
    }
    const key = this.keyOf(command);
    const entry = tvKeyMap(this.tvOf(device), this.valuesOf(device), this.pathsOf(device))(key);
    if (entry.path === null) {
      throw new CommandRefusedError(command.capability, TV_KEY_REASON_TEXT[entry.reason]);
    }
    return this.attempt(device, command, [
      { path: entry.path, send: entry.send },
      ...entry.fallbacks,
    ]);
  }

  private attachedTo(device: DeviceRecord): string | null {
    const attached = this.options.attachedTo();
    return attached === device.id && this.options.adapters.adapterFor('samsung_tv') !== undefined
      ? attached
      : null;
  }

  private tvOf(device: DeviceRecord): TvDevice {
    return {
      id: device.id,
      kind: 'television',
      model: '',
      online: device.online,
      capabilities: device.capabilities,
    };
  }

  private valuesOf(device: DeviceRecord): ReturnType<typeof tvValuesOf> {
    return tvValuesOf(this.tvOf(device), (capability) =>
      this.options.valueOf(device.id, capability),
    );
  }

  private pathsOf(device: DeviceRecord): TvPaths {
    return tvPathsFor(this.attachedTo(device) !== null);
  }

  private keyOf(command: DeviceCommand): TvKey {
    if (command.capability === 'power') {
      return command.value === true ? 'power_on' : 'power_off';
    }
    const key = TV_KEY.safeParse(command.value);
    if (!key.success) {
      throw new CommandRefusedError(command.capability, 'not a known remote key');
    }
    return key.data;
  }

  private requestOf(device: DeviceRecord, command: DeviceCommand): CommandRequest {
    return {
      deviceId: device.id,
      capability: command.capability,
      value: command.value,
    };
  }

  private async attempt(
    device: DeviceRecord,
    command: DeviceCommand,
    [route, ...rest]: Routes,
  ): Promise<JsonValue> {
    try {
      return await this.send(device, command, route);
    } catch (cause) {
      const [next, ...others] = rest;
      if (next === undefined) {
        throw cause;
      }
      this.options.log.warn('television.route_failed', {
        deviceId: device.id,
        capability: command.capability,
        path: route.path,
        reason: failureLine(cause),
      });
      return this.attempt(device, command, [next, ...others]);
    }
  }

  private send(device: DeviceRecord, command: DeviceCommand, route: TvRoute): Promise<JsonValue> {
    const { capability, value } = route.send;
    if (route.path === 'smartthings') {
      return adapterOf(this.options.adapters, 'smartthings').execute({
        commandId: command.commandId,
        externalId: device.externalId,
        capability,
        value,
      });
    }
    return adapterOf(this.options.adapters, 'samsung_tv').execute({
      commandId: command.commandId,
      externalId: device.externalId,
      capability,
      value: capability === 'remote_key' ? this.directCode(value) : value,
    });
  }

  private directCode(value: JsonValue): string {
    const code = TV_DIRECT_CODES[TV_KEY.parse(value)];
    if (code === undefined) {
      throw new CommandRefusedError('remote_key', 'the direct connection cannot send this key');
    }
    return code;
  }
}
