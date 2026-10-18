import type { DeviceRow, JsonValue } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { phoneExternalId } from '../phones/phone-device';
import type { NewCommand } from '../store/repositories/commands';
import type { DevicesRepository } from '../store/repositories/devices';
import type { StateRepository } from '../store/repositories/state';

const PLAYING = ['playing', 'play'] as const;
const PAUSED = ['paused', 'pause'] as const;
const STOPPED = 'stopped';

interface RoomMediaStore {
  readonly devices: Pick<DevicesRepository, 'list' | 'find' | 'byExternal'>;
  readonly state: Pick<StateRepository, 'ofDevice'>;
}

export interface RoomMediaOptions {
  readonly store: RoomMediaStore;
  readonly enabled: () => boolean;
  readonly submit: (commands: readonly NewCommand[]) => void;
  readonly log: Logger;
}

export interface SpeakingAnchor {
  readonly deviceId: string | null;
  readonly clientId: string | null;
  readonly externalId?: string;
}

export interface SpeakingCall extends SpeakingAnchor {
  readonly id: string;
}

function optionOf(device: DeviceRow, wanted: readonly string[]): string | null {
  const value = device.capabilities.find(
    (entry) => entry.key === 'playback' && entry.access !== 'read',
  )?.value;
  const options = value?.kind === 'enum' ? value.options : [];
  return wanted.find((option) => options.includes(option)) ?? null;
}

function command(deviceId: string, value: string): NewCommand {
  return { deviceId, capability: 'playback', value, source: 'assistant', requestedBy: null };
}

export interface SpeakingMedia {
  readonly speaking: (call: SpeakingCall, speaking: boolean) => void;
}

export class SpeakingScope {
  private sounding = false;
  private closed = false;

  constructor(
    private readonly media: SpeakingMedia | undefined,
    private readonly call: SpeakingCall,
  ) {}

  start(): void {
    if (!this.sounding && !this.closed) {
      this.sounding = true;
      this.media?.speaking(this.call, true);
    }
  }

  stop(): void {
    if (this.sounding) {
      this.sounding = false;
      this.media?.speaking(this.call, false);
    }
  }

  close(): void {
    this.stop();
    this.closed = true;
  }
}

export class RoomMedia implements SpeakingMedia {
  private readonly holders = new Map<string, Set<string>>();

  constructor(private readonly options: RoomMediaOptions) {}

  speaking(call: SpeakingCall, speaking: boolean): void {
    if (speaking) {
      if (this.options.enabled()) {
        this.pause(call);
      }
      return;
    }
    this.resume(call.id);
  }

  private pause(call: SpeakingCall): void {
    const roomId = this.anchorOf(call)?.room_id ?? null;
    if (roomId === null) {
      return;
    }
    const commands = this.options.store.devices
      .list()
      .filter((device) => device.room_id === roomId && device.online)
      .flatMap((device) => this.pausing(device, call.id));
    if (!this.send('paused', call.id, commands)) {
      commands.forEach((entry) => {
        if (entry.deviceId !== null) {
          this.holders.delete(entry.deviceId);
        }
      });
    }
  }

  private pausing(device: DeviceRow, callId: string): readonly NewCommand[] {
    const held = this.holders.get(device.id);
    if (held !== undefined) {
      held.add(callId);
      return [];
    }
    const pause = optionOf(device, PAUSED);
    if (pause === null || this.stateOf(device.id) !== 'playing') {
      return [];
    }
    this.holders.set(device.id, new Set([callId]));
    return [command(device.id, pause)];
  }

  private resume(callId: string): void {
    const commands: NewCommand[] = [];
    for (const [deviceId, held] of this.holders) {
      if (!held.delete(callId) || held.size > 0) {
        continue;
      }
      this.holders.delete(deviceId);
      const device = this.options.store.devices.find(deviceId);
      const play = device === undefined ? null : optionOf(device, PLAYING);
      if (play !== null && this.stateOf(deviceId) !== STOPPED) {
        commands.push(command(deviceId, play));
      }
    }
    this.send('resumed', callId, commands);
  }

  private send(
    step: 'paused' | 'resumed',
    callId: string,
    commands: readonly NewCommand[],
  ): boolean {
    if (commands.length === 0) {
      return true;
    }
    try {
      this.options.submit(commands);
    } catch (cause) {
      this.options.log.error('reach.room_media_failed', cause, { step, callId });
      return false;
    }
    this.options.log.info('reach.room_media', {
      step,
      callId,
      devices: commands.map((entry) => entry.deviceId),
    });
    return true;
  }

  private anchorOf(call: SpeakingCall): DeviceRow | undefined {
    const { devices } = this.options.store;
    if (call.deviceId !== null) {
      return devices.find(call.deviceId);
    }
    if (call.externalId !== undefined) {
      return devices.byExternal('local', call.externalId);
    }
    return call.clientId === null
      ? undefined
      : devices.byExternal('local', phoneExternalId(call.clientId));
  }

  private stateOf(deviceId: string): JsonValue | undefined {
    return this.options.store.state.ofDevice(deviceId).find((row) => row.capability === 'playback')
      ?.value;
  }
}
