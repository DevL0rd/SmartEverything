import type {
  AdapterSink,
  ComputerScopes,
  DeviceCommand,
  JsonValue,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { DeviceDriver } from '../local/device-driver';
import type { MetricHistory } from '../metrics/history';
import type { Viewers } from '../metrics/viewers';
import type { HubLink } from '../node/link';
import type { AppTime } from './app-focus';
import { runComputerCommand, type ComputerCommandRecords } from './computer-commands';
import { COMPUTER_DRIVER } from './computer-device';
import type { ComputerDirectory } from './computer-directory';
import { ComputerOfflineError } from './computer-errors';
import { ComputerSession } from './computer-session';

export interface ComputerDriverOptions {
  readonly link: HubLink;
  readonly history: MetricHistory;
  readonly viewers: Viewers;
  readonly deviceIdOf: (externalId: string) => string | undefined;
  readonly scopesOf: (deviceId: string) => ComputerScopes;
  readonly directory: ComputerDirectory;
  readonly records: ComputerCommandRecords;
  readonly recordAppTime: (time: AppTime) => void;
  readonly attach: () => () => void;
  readonly now: () => Date;
  readonly log: Logger;
}

export function computerDriver(options: ComputerDriverOptions): DeviceDriver {
  let sink: AdapterSink | null = null;
  return {
    id: COMPUTER_DRIVER,
    start: (context): Promise<() => Promise<void>> => {
      sink = context.sink;
      const session = new ComputerSession({ ...options, host: true, sink: context.sink });
      const leave = options.directory.add(session);
      const detach = options.attach();
      return Promise.resolve((): Promise<void> => {
        detach();
        leave();
        session.stop();
        sink = null;
        return Promise.resolve();
      });
    },
    execute: (command: DeviceCommand): Promise<JsonValue> => {
      if (sink === null) {
        return Promise.reject(new ComputerOfflineError());
      }
      return runComputerCommand(command, { ...options, ...options.records, sink });
    },
  };
}
