import { watch, type FSWatcher } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { Logger } from '@smarteverything/logging';
import type { NodeRouteAuthority } from '../client-network/route-authority';
import { readPrivateServiceFile } from './private-files';
import { NODE_SERVICE_READY, SERVICE_READY_FILE } from './configuration';
import type { NodeRouteView } from './route-view';
const FILE = 'node-route-notice.json';
const NOTICE = z.strictObject({
  authorityId: z.uuid(),
  pid: z.int().positive(),
  routeGeneration: z.int().nonnegative(),
  kind: z.enum(['failed', 'refresh']),
  noticeId: z.uuid(),
});
export async function writeRouteNotice(
  directory: string,
  view: NodeRouteView,
  kind: 'failed' | 'refresh',
): Promise<void> {
  const notice = NOTICE.parse({
    authorityId: view.authorityId,
    pid: view.pid,
    routeGeneration: view.state.routeGeneration,
    kind,
    noticeId: randomUUID(),
  });
  const temporary = join(directory, `${FILE}.${notice.noticeId}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(notice)}\n`, { mode: 0o600, flag: 'wx' });
    await rename(temporary, join(directory, FILE));
  } finally {
    await rm(temporary, { force: true });
  }
}
export class NodeRouteNotices {
  private watcher: FSWatcher | null = null;
  private reading: Promise<void> = Promise.resolve();
  private latest: string | null = null;
  private stopped = false;
  constructor(
    readonly directory: string,
    readonly authorityId: string,
    readonly authority: NodeRouteAuthority,
    readonly events: { readonly log: Logger; readonly completed: () => void },
  ) {}
  async start(): Promise<void> {
    await rm(join(this.directory, FILE), { force: true });
    this.watcher = watch(this.directory, (_event, name): void => {
      if (name !== FILE || this.stopped) return;
      this.reading = this.reading
        .then(() => this.receive())
        .catch((cause: unknown): void => {
          this.events.log.warn('route.notice_refused', {
            error_name: cause instanceof Error ? cause.name : 'unknown',
          });
        });
    });
    this.watcher.on('error', (cause: Error): void => {
      this.events.log.error('route.notice_watch_failed', cause);
    });
  }
  private async receive(): Promise<void> {
    const notice = NOTICE.parse(JSON.parse(await readPrivateServiceFile(this.directory, FILE)));
    const ready = NODE_SERVICE_READY.parse(
      JSON.parse(await readPrivateServiceFile(this.directory, SERVICE_READY_FILE)),
    );
    if (
      this.stopped ||
      notice.noticeId === this.latest ||
      notice.authorityId !== this.authorityId ||
      notice.pid !== process.pid ||
      ready.pid !== process.pid ||
      ready.route_authority !== this.authorityId ||
      notice.routeGeneration !== this.authority.state.routeGeneration
    )
      return;
    this.latest = notice.noticeId;
    if (notice.kind === 'failed') this.authority.failed(notice.routeGeneration);
    else
      void this.authority.refresh().then(
        (): void => {
          if (!this.stopped && !this.authority.state.localSupported) this.events.completed();
        },
        (cause: unknown): void => {
          this.events.log.error('route.notice_refresh_failed', cause);
        },
      );
  }
  async stop(): Promise<void> {
    this.stopped = true;
    this.watcher?.close();
    await this.reading;
    await rm(join(this.directory, FILE), { force: true });
  }
}
