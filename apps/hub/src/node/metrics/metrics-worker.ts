import { parentPort, workerData, type MessagePort } from 'node:worker_threads';
import { Logger, messageOf, shippedRecord } from '@smarteverything/logging';
import { collectorFor } from '../collectors/collector';
import { processesFor } from '../controls/processes-for';
import { inlineMetrics } from './node-metrics';
import { METRICS_WORKER_DATA, TO_METRICS, type FromMetrics } from './metrics-protocol';

function parentPortOf(): MessagePort {
  if (parentPort === null) throw new Error('The computer metrics worker needs a parent port.');
  return parentPort;
}

const port = parentPortOf();
const data = METRICS_WORKER_DATA.parse(workerData);
const post = (message: FromMetrics): void => {
  port.postMessage(message);
};

Logger.configure({
  level: data.level,
  sink: (record) => {
    if (record.level !== 'none') post({ type: 'log', record: shippedRecord(record, 'server') });
  },
});

const log = new Logger('hub.node-metrics');
const processes = processesFor(process.platform, log);
const metrics = inlineMetrics(
  collectorFor(process.platform, { log, machineId: data.machineId, now: Date.now }),
)({
  processes,
  policy: data.policy,
  emit: (frame) => {
    post({ type: 'frame', frame });
  },
  now: Date.now,
  log,
});

function answer(id: number, work: Promise<FromMetrics>): void {
  work.then(post, (cause: unknown) => {
    post({ type: 'failed', id, message: messageOf(cause) });
  });
}

type Command = ReturnType<typeof TO_METRICS.parse>;

type Control = Exclude<Command, { readonly type: 'hello' | 'backfill' | 'close' }>;

function control(message: Control): void {
  switch (message.type) {
    case 'start':
      metrics.start();
      return;
    case 'stop':
      metrics.stop();
      return;
    case 'demand':
      metrics.demand(message.owner, message.topics);
      return;
    case 'release':
      metrics.release(message.owner);
      return;
    case 'poke':
      metrics.poke(message.topic);
      return;
    case 'policy':
      metrics.setPolicy(message.policy);
      return;
    case 'track':
      metrics.track(message.policy);
      return;
    case 'watch':
      metrics.watchProcesses(message.window);
  }
}

function handle(message: Command): void {
  if (message.type !== 'hello' && message.type !== 'backfill' && message.type !== 'close') {
    control(message);
    return;
  }
  switch (message.type) {
    case 'hello':
      answer(
        message.id,
        metrics
          .hello(new Date(message.now))
          .then((hello) => ({ type: 'hello', id: message.id, hello })),
      );
      return;
    case 'backfill':
      answer(
        message.id,
        metrics.backfill(message.query).then((columns) => ({
          type: 'backfill',
          id: message.id,
          columns,
        })),
      );
      return;
    case 'close':
      metrics.close();
      processes.stop();
      port.close();
  }
}

port.on('message', (raw: unknown) => {
  handle(TO_METRICS.parse(raw));
});
