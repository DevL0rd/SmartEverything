import type { ComputerScopes } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { DeviceDriver } from '../local/device-driver';
import type { MetricHistory } from '../metrics/history';
import type { Viewers } from '../metrics/viewers';
import { collectorFor } from '../node/collectors/collector';
import { ComputerNode } from '../node/computer-node';
import { controlsFor } from '../node/controls/controls';
import { localLinks } from '../node/link';
import type { AppTime } from './app-focus';
import type { ComputerCommandRecords } from './computer-commands';
import type { ComputerDirectory } from './computer-directory';
import { computerDriver } from './computer-driver';

export interface LocalComputerOptions {
  readonly history: MetricHistory;
  readonly viewers: Viewers;
  readonly deviceIdOf: (externalId: string) => string | undefined;
  readonly scopesOf: (deviceId: string) => ComputerScopes;
  readonly directory: ComputerDirectory;
  readonly records: ComputerCommandRecords;
  readonly recordAppTime: (time: AppTime) => void;
  readonly now: () => Date;
  readonly log: Logger;
}

export function localComputerDriver(options: LocalComputerOptions): DeviceDriver {
  const links = localLinks();
  return computerDriver({
    ...options,
    link: links.hub,
    attach: () => {
      const node = new ComputerNode({
        collector: collectorFor(process.platform, options.log),
        controls: controlsFor(process.platform, { now: options.now, log: options.log }),
        link: links.node,
        now: options.now,
        log: options.log,
      });
      node.start();
      return (): void => {
        node.stop();
      };
    },
  });
}
