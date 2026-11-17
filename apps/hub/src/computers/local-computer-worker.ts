import { parentPort, workerData } from 'node:worker_threads';
import { Logger, shippedRecord } from '@smarteverything/logging';
import type { HubFrame } from '@smarteverything/domain';
import { ComputerNode } from '../node/computer-node';
import { collectorFor } from '../node/collectors/collector';
import { controlsFor } from '../node/controls/controls';
import { pipeLink } from '../node/link';
import {
  LOCAL_COMPUTER_DATA,
  TO_LOCAL_COMPUTER,
  type FromLocalComputer,
} from './local-computer-protocol';

const port = parentPort;
if (port === null) throw new Error('The local computer worker needs a parent port.');
const data = LOCAL_COMPUTER_DATA.parse(workerData);
const post = (message: FromLocalComputer): void => {
  port.postMessage(message);
};

Logger.configure({
  level: data.level,
  context: { platform: 'server', release: data.release },
  sink: (record) => {
    if (record.level !== 'none') post({ type: 'log', record: shippedRecord(record, 'server') });
  },
});

const log = new Logger('hub.computers');
const now = (): Date => new Date();
const pipe = pipeLink<unknown, HubFrame>((frame) => {
  post({ type: 'frame', frame });
});
const node = new ComputerNode({
  collector: collectorFor(process.platform, {
    log,
    machineId: data.machineId,
    now: () => Date.now(),
  }),
  controls: controlsFor(process.platform, { now, log, role: 'hub' }),
  link: pipe.link,
  now,
  log,
});

port.on('message', (raw: unknown) => {
  const message = TO_LOCAL_COMPUTER.parse(raw);
  if (message.type === 'frame') {
    pipe.deliver(message.frame);
    return;
  }
  node.stop();
  port.close();
});

node.start();
