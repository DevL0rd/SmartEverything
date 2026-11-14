import { watch, type FSWatcher } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import {
  HUB_UPDATE_LEDGER_FILE,
  appendTo,
  hubUpdateFinished,
  releaseOf,
  type HubUpdateLedger,
  type HubUpdateRelease,
} from '@smarteverything/domain';
import type { HubLayout } from '../data-layout';
import { readHubUpdateLedger } from './recovery';

type Waiter = (release: HubUpdateRelease) => void;

export class ReleaseWatch {
  private readonly waiters = new Map<string, Waiter[]>();
  private watcher: FSWatcher | undefined;
  private reading = Promise.resolve();

  constructor(
    private readonly layout: HubLayout,
    private readonly failed: (cause: unknown) => void,
  ) {}

  async start(): Promise<void> {
    const directory = this.layout.system.updates.selfUpdate;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    this.watcher = watch(directory, (_event, filename) => {
      if (filename === HUB_UPDATE_LEDGER_FILE || filename === null) this.settle();
    });
    this.watcher.on('error', this.failed);
  }

  async stop(): Promise<void> {
    this.watcher?.close();
    this.waiters.clear();
    await this.reading;
  }

  finished(runId: string): Promise<HubUpdateRelease> {
    return new Promise((resolve) => {
      appendTo(this.waiters, runId, resolve);
      this.settle();
    });
  }

  private settle(): void {
    this.reading = this.reading.then(async () => {
      if (this.waiters.size === 0) return;
      try {
        const ledger = await readHubUpdateLedger(this.layout);
        for (const runId of [...this.waiters.keys()]) this.resolveRun(ledger, runId);
      } catch (cause) {
        this.failed(cause);
      }
    });
  }

  private resolveRun(ledger: HubUpdateLedger, runId: string): void {
    const release = releaseOf(ledger, runId);
    if (release === undefined || !hubUpdateFinished(release)) return;
    for (const waiter of this.waiters.get(runId) ?? []) waiter(release);
    this.waiters.delete(runId);
  }
}
