import { driverIdOf } from '../local/device-driver';
import type { Unsubscribe } from './builtin/contract';

export interface PluginSpeaker {
  readonly externalId: string;
  readonly label: string;
  readonly speak: (text: string) => Promise<void>;
}

export interface SpeakerDevice {
  readonly provider: string;
  readonly external_id: string;
}

class PluginSpeakerTakenError extends Error {
  override readonly name = 'PluginSpeakerTakenError';

  constructor(
    readonly externalId: string,
    readonly pluginId: string,
  ) {
    super(`The device ${externalId} already has a speaker, registered by ${pluginId}.`);
  }
}

class PluginSpeakerForeignDeviceError extends Error {
  override readonly name = 'PluginSpeakerForeignDeviceError';

  constructor(
    readonly externalId: string,
    readonly pluginId: string,
  ) {
    super(`${pluginId} can only register a speaker for a device of its own, not ${externalId}.`);
  }
}

export class PluginSpeakers {
  private readonly speakers = new Map<
    string,
    { readonly pluginId: string; readonly speaker: PluginSpeaker }
  >();

  register(pluginId: string, speaker: PluginSpeaker, ownDrivers: ReadonlySet<string>): Unsubscribe {
    const driver = driverIdOf(speaker.externalId);
    if (driver === null || !ownDrivers.has(driver)) {
      throw new PluginSpeakerForeignDeviceError(speaker.externalId, pluginId);
    }
    const taken = this.speakers.get(speaker.externalId);
    if (taken !== undefined) {
      throw new PluginSpeakerTakenError(speaker.externalId, taken.pluginId);
    }
    const entry = { pluginId, speaker };
    this.speakers.set(speaker.externalId, entry);
    return (): void => {
      if (this.speakers.get(speaker.externalId) === entry) {
        this.speakers.delete(speaker.externalId);
      }
    };
  }

  forDevice(device: SpeakerDevice): PluginSpeaker | null {
    return device.provider === 'local'
      ? (this.speakers.get(device.external_id)?.speaker ?? null)
      : null;
  }
}
