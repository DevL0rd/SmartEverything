import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { AdapterSink, HubFrame } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { pipeLink, type Link } from '../node/link';
import { logRecordOf } from '../store/repositories/runtime-logs';
import { HUB_VERSION } from '../version';
import { HUB_EXTERNAL_ID } from './computer-device';
import type { ComputerDriverOptions } from './computer-driver';
import { ComputerSession } from './computer-session';
import {
  FROM_LOCAL_COMPUTER,
  type LocalComputerData,
  type ToLocalComputer,
} from './local-computer-protocol';

export const BUNDLED_LOCAL_COMPUTER_WORKER = fileURLToPath(
  new URL('./local-computer-worker.mjs', import.meta.url),
);

export type LocalComputerLink = Link<unknown, HubFrame>;

export interface LocalComputer {
  readonly start: () => void;
  readonly stop: () => void;
}

export type LocalComputerFactory = (link: LocalComputerLink) => LocalComputer;

export class LocalComputerExitError extends Error {
  override readonly name = 'LocalComputerExitError';

  constructor(readonly code: number) {
    super(`The Hub computer thread stopped with code ${String(code)}.`);
  }
}

interface WorkerComputerOptions {
  readonly script: string;
  readonly machineId: string;
  readonly log: Logger;
}

class WorkerComputer implements LocalComputer {
  private worker: Worker | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly options: WorkerComputerOptions,
    private readonly link: LocalComputerLink,
  ) {}

  start(): void {
    const data: LocalComputerData = {
      machineId: this.options.machineId,
      level: Logger.level,
      release: HUB_VERSION,
    };
    const worker = new Worker(this.options.script, { workerData: data });
    worker.unref();
    this.worker = worker;
    worker.on('message', (raw: unknown) => {
      this.received(raw);
    });
    worker.on('error', (cause) => {
      this.options.log.error('computer.local_worker_failed', cause);
    });
    worker.on('exit', (code) => {
      if (this.worker === worker)
        this.options.log.error('computer.local_worker_exited', new LocalComputerExitError(code));
    });
    this.unsubscribe = this.link.onFrame((frame) => {
      this.post(worker, { type: 'frame', frame });
    });
    this.options.log.info('computer.local_worker_started', {});
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    const worker = this.worker;
    this.worker = null;
    if (worker !== null) this.post(worker, { type: 'stop' });
  }

  private post(worker: Worker, message: ToLocalComputer): void {
    worker.postMessage(message);
  }

  private received(raw: unknown): void {
    const message = FROM_LOCAL_COMPUTER.parse(raw);
    if (message.type === 'frame') this.link.send(message.frame);
    else Logger.relay(logRecordOf(message.record));
  }
}

export function localComputerFactory(options: WorkerComputerOptions): LocalComputerFactory {
  return (link) => new WorkerComputer(options, link);
}

export function startLocalComputer(options: ComputerDriverOptions, sink: AdapterSink): () => void {
  const node = pipeLink<unknown, HubFrame>((frame) => {
    hub.deliver(frame);
  });
  const hub = pipeLink<HubFrame, unknown>((frame) => {
    node.deliver(frame);
  });
  const session = new ComputerSession({
    ...options,
    identity: { externalId: HUB_EXTERNAL_ID, role: 'hub' },
    link: hub.link,
    sink,
  });
  const leave = options.directory.add(session);
  try {
    const computer = options.createLocal(node.link);
    computer.start();
    return (): void => {
      computer.stop();
      session.stop();
      leave();
    };
  } catch (cause) {
    session.stop();
    leave();
    throw cause;
  }
}
