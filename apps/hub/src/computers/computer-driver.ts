import type {
  AdapterSink,
  ComputerLiveNotice,
  ComputerScopes,
  DeviceCommand,
  HistoryPolicy,
  JsonValue,
  ProcessWindow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { DeviceDriver, DeviceDriverContext } from '../local/device-driver';
import type { MetricHistory } from '../metrics/history';
import type { Viewers } from '../metrics/viewers';
import type { HubLink } from '../node/link';
import type { SignalBus } from '../signals/bus';
import type { AppTime } from './app-focus';
import type { SessionEars } from './computer-ears';
import type { SessionEarHosts } from '../listening/ear-hosts';
import { runComputerCommand, type ComputerCommandRecords } from './computer-commands';
import { COMPUTER_DRIVER, HUB_EXTERNAL_ID, describeHub, type HubMachine } from './computer-device';
import type { ComputerDirectory } from './computer-directory';
import { ComputerOfflineError } from './computer-errors';
import { ComputerSession } from './computer-session';
import { startLocalComputer, type LocalComputerFactory } from './local-computer';

export interface ComputerDriverOptions {
  readonly history: MetricHistory;
  readonly viewers: Viewers<ProcessWindow>;
  readonly policyOf: (deviceId: string) => HistoryPolicy;
  readonly publish: (notice: ComputerLiveNotice) => void;
  readonly deviceIdOf: (externalId: string) => string | undefined;
  readonly scopesOf: (deviceId: string) => ComputerScopes;
  readonly directory: ComputerDirectory;
  readonly records: ComputerCommandRecords;
  readonly recordAppTime: (time: AppTime) => void;
  readonly signals: Pick<SignalBus, 'emit'>;
  readonly personOf: (deviceId: string) => string | null;
  readonly hub: HubMachine;
  readonly createLocal: LocalComputerFactory;
  readonly bindHubDevice: (deviceId: string) => void;
  readonly ears?: SessionEars;
  readonly earHosts?: SessionEarHosts;
  readonly now: () => Date;
  readonly log: Logger;
}

interface ComputerDriver extends DeviceDriver {
  readonly attach: (link: HubLink) => () => void;
}

async function registerHub(
  options: ComputerDriverOptions,
  publish: DeviceDriverContext['publishDevices'],
): Promise<void> {
  await publish([describeHub(options.hub)]);
  const deviceId = options.deviceIdOf(HUB_EXTERNAL_ID);
  if (deviceId === undefined) throw new Error('The hub device was not registered.');
  options.bindHubDevice(deviceId);
  options.log.info('computer.hub_device_bound', { deviceId });
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
    start: async (context): Promise<() => Promise<void>> => {
      sink = context.sink;
      try {
        await registerHub(options, context.publishDevices);
        const stopLocal = startLocalComputer(options, context.sink);
        return (): Promise<void> => {
          stopLocal();
          sink = null;
          return Promise.resolve();
        };
      } catch (cause) {
        sink = null;
        throw cause;
      }
    },
    execute: (command: DeviceCommand): Promise<JsonValue> => {
      if (sink === null) {
        return Promise.reject(new ComputerOfflineError());
      }
      return runComputerCommand(command, { ...options, ...options.records, sink });
    },
  };
}
