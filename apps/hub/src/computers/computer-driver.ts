import type {
  AdapterSink,
  ComputerLiveNotice,
  ComputerRole,
  ComputerScopes,
  DeviceCommand,
  HistoryPolicy,
  JsonValue,
  ProcessWindow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { DeviceDriver } from '../local/device-driver';
import type { MetricHistory } from '../metrics/history';
import type { Viewers } from '../metrics/viewers';
import type { HubLink } from '../node/link';
import type { SignalBus } from '../signals/bus';
import type { AppTime } from './app-focus';
import type { SessionEars } from './computer-ears';
import type { SessionEarHosts } from '../listening/ear-hosts';
import { runComputerCommand, type ComputerCommandRecords } from './computer-commands';
import { COMPUTER_DRIVER } from './computer-device';
import type { ComputerDirectory } from './computer-directory';
import { ComputerOfflineError } from './computer-errors';
import { ComputerSession } from './computer-session';

export interface ComputerDriverOptions {
  readonly history: MetricHistory;
  readonly viewers: Viewers<ProcessWindow>;
  readonly policyOf: (deviceId: string, role: ComputerRole) => HistoryPolicy;
  readonly publish: (notice: ComputerLiveNotice) => void;
  readonly deviceIdOf: (externalId: string) => string | undefined;
  readonly scopesOf: (deviceId: string) => ComputerScopes;
  readonly directory: ComputerDirectory;
  readonly records: ComputerCommandRecords;
  readonly recordAppTime: (time: AppTime) => void;
  readonly signals: Pick<SignalBus, 'emit'>;
  readonly personOf: (deviceId: string) => string | null;
  readonly hubComputerResolved: (deviceId: string) => void;
  readonly ears?: SessionEars;
  readonly earHosts?: SessionEarHosts;
  readonly now: () => Date;
  readonly log: Logger;
}

interface ComputerDriver extends DeviceDriver {
  readonly attach: (link: HubLink) => () => void;
}

export function computerDriver(options: ComputerDriverOptions): ComputerDriver {
  let sink: AdapterSink | null = null;
  return {
    id: COMPUTER_DRIVER,
    attach: (link) => {
      if (sink === null) throw new ComputerOfflineError();
      const session = new ComputerSession({ ...options, link, sink });
      const leave = options.directory.add(session);
      return (): void => {
        leave();
        session.stop();
      };
    },
    start: (context): Promise<() => Promise<void>> => {
      sink = context.sink;
      return Promise.resolve((): Promise<void> => {
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
