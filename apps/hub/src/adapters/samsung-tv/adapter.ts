import {
  CommandRefusedError,
  type DeviceCommand,
  type JsonValue,
  type ProviderAdapter,
  type StateUpdate,
  type Unsubscribe,
} from '@smarteverything/domain';
import { resolveTvCommand, tvDevice } from '@smarteverything/smartthings';
import { background, failureLine } from '@smarteverything/logging';
import type { RunContext } from '../contract';
import { sameTelevision } from './address-follow';
import { TvConnectionError } from './connection';
import { TvController } from './controller';
import type { SamsungTvIo } from './io';
import { readTvInfo, televisionsAccount, type TvAccount } from './link';

class TvFleet {
  readonly screens: readonly TvController[];
  private accounts: readonly TvAccount[];

  constructor(
    accounts: readonly TvAccount[],
    private readonly io: SamsungTvIo,
    private readonly context: RunContext,
  ) {
    this.accounts = accounts;
    this.screens = accounts.map(
      (account) => new TvController(account, io, context, (changed) => this.save(changed)),
    );
  }

  screenFor(command: DeviceCommand): TvController {
    const screen = this.screens.find((candidate) => candidate.answers(command.externalId));
    if (screen === undefined) {
      throw new CommandRefusedError(command.capability, 'the screen is not linked directly');
    }
    return screen;
  }

  async follow(host: string): Promise<void> {
    if (this.screens.some((screen) => screen.host === host)) {
      return;
    }
    let info: Awaited<ReturnType<typeof readTvInfo>>;
    try {
      info = await readTvInfo(this.io, host);
    } catch (cause) {
      if (cause instanceof TvConnectionError) {
        return;
      }
      throw cause;
    }
    await this.screens.find((screen) => sameTelevision(info, screen.macAddress))?.moveTo(host);
  }

  private async save(changed: TvAccount): Promise<void> {
    this.accounts = this.accounts.map((account) =>
      account.macAddress === changed.macAddress ? changed : account,
    );
    await this.context.saveAccount(televisionsAccount(this.accounts));
  }
}

export function createSamsungTvAdapter(
  accounts: readonly TvAccount[],
  io: SamsungTvIo,
  context: RunContext,
): ProviderAdapter {
  const fleet = new TvFleet(accounts, io, context);
  const own = (): readonly TvController[] => fleet.screens.filter((screen) => !screen.attached);
  return {
    provider: 'samsung_tv',
    discover: () => Promise.resolve(own().map((screen) => tvDevice(screen.identity(), true))),
    subscribe: (sink): Promise<Unsubscribe> => {
      fleet.screens.forEach((screen) => {
        screen.attach(sink);
      });
      own().forEach((screen) => {
        screen.polling.start();
      });
      const stopWatching = io.announcements(
        (host) => {
          background(fleet.follow(host), 'television.address_follow_failed');
        },
        (cause) => {
          context.log.warn('television.announcements_failed', { reason: failureLine(cause) });
        },
      );
      return Promise.resolve(() => {
        stopWatching();
        fleet.screens.forEach((screen) => {
          screen.polling.stop();
          screen.close();
          screen.attach(null);
        });
        return Promise.resolve();
      });
    },
    execute: async (command: DeviceCommand): Promise<JsonValue> => {
      const screen = fleet.screenFor(command);
      await screen.perform(resolveTvCommand(command.capability, command.value, screen.frame));
      return null;
    },
    refresh: async (externalIds): Promise<readonly StateUpdate[]> => {
      const asked = own().filter((screen) => externalIds.includes(screen.externalId));
      return (await Promise.all(asked.map((screen) => screen.refresh()))).flat();
    },
  };
}
