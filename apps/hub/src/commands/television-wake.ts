import {
  CommandRefusedError,
  type JsonValue,
  type TelevisionSettingsRow,
} from '@smarteverything/domain';
import { failureLine, type Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import { WAKE_BOOT_MS, WAKE_RESENDS_MS } from '../network/wake-budget';
import type { WakeOnLan } from '../network/wake-on-lan';
import type { SignalListener } from '../signals/bus';

export const WAKE_REPORT_MS = 15_000;

export const WAKE_DEADLINE_MS = WAKE_BOOT_MS + WAKE_REPORT_MS;

const SECOND_MS = 1000;

export const NO_WAKE_ADDRESS =
  'the screen is off and SmartThings cannot reach it, and it is not linked directly. While the screen is on, open its settings, choose Link directly and allow it on the screen; the link learns the address that turns it on. Without a direct link, enter its Wake-on-LAN address there';

export class TelevisionDidNotWakeError extends Error {
  override readonly name = 'TelevisionDidNotWakeError';

  constructor(readonly deviceId: string) {
    super(
      `The screen did not come online within ${String(WAKE_DEADLINE_MS / SECOND_MS)} s of the Wake-on-LAN packets. On the screen, turn on Power On with Mobile (Settings, General, Network, Expert Settings) and keep it on the same network as the hub.`,
    );
  }
}

export class WakePacketsFailedError extends Error {
  override readonly name = 'WakePacketsFailedError';

  constructor(
    readonly deviceId: string,
    cause: unknown,
  ) {
    super(`The Wake-on-LAN packets for the screen could not be sent: ${failureLine(cause)}.`, {
      cause,
    });
  }
}

export interface TelevisionWakeOptions {
  readonly wake: WakeOnLan;
  readonly settingsOf: (deviceId: string) => TelevisionSettingsRow | undefined;
  readonly online: (deviceId: string) => boolean;
  readonly subscribe: (listener: SignalListener) => () => void;
  readonly woke: (deviceId: string) => void;
  readonly clock: Clock;
  readonly log: Logger;
}

export class TelevisionWake {
  constructor(private readonly options: TelevisionWakeOptions) {}

  async powerOn(deviceId: string, switchOn: () => Promise<JsonValue>): Promise<JsonValue> {
    if (this.options.online(deviceId)) {
      return switchOn();
    }
    const settings = this.options.settingsOf(deviceId);
    if (settings === undefined || settings.wake_macs.length === 0) {
      throw new CommandRefusedError('power', NO_WAKE_ADDRESS);
    }
    const burst = (): Promise<void> =>
      Promise.all(settings.wake_macs.map((mac) => this.options.wake(mac))).then(() => undefined);
    this.options.log.info('television.waking', { deviceId, macs: settings.wake_macs.length });
    if (!(await this.cameOnline(deviceId, burst))) {
      throw new TelevisionDidNotWakeError(deviceId);
    }
    this.options.woke(deviceId);
    this.options.log.info('television.woke', { deviceId });
    return switchOn();
  }

  private cameOnline(deviceId: string, burst: () => Promise<void>): Promise<boolean> {
    const { clock, subscribe } = this.options;
    return new Promise((resolve, reject) => {
      const cancels: Cancel[] = [];
      const settle = (): void => {
        cancels.forEach((cancel) => {
          cancel();
        });
      };
      const send = (): void => {
        burst().catch((cause: unknown) => {
          settle();
          reject(new WakePacketsFailedError(deviceId, cause));
        });
      };
      cancels.push(
        subscribe((signal) => {
          if (
            signal.source === 'device' &&
            signal.kind === 'online' &&
            signal.subject === deviceId &&
            signal.value === true
          ) {
            settle();
            resolve(true);
          }
        }),
      );
      const start = clock.now().getTime();
      for (const after of WAKE_RESENDS_MS) {
        cancels.push(clock.at(new Date(start + after), send));
      }
      cancels.push(
        clock.at(new Date(start + WAKE_DEADLINE_MS), () => {
          settle();
          resolve(false);
        }),
      );
      send();
    });
  }
}
