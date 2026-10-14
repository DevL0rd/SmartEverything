import { randomUUID } from 'node:crypto';
import { writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { HUB_ENDPOINT, NATIVE_HUB_TRUST } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { serviceProcessStart } from './process-identity';
import type { NodeRouteAuthority } from '../client-network/route-authority';
export const NODE_ROUTE_VIEW_FILE = 'node-route-view.json';
export const NODE_ROUTE_VIEW = z.strictObject({
  authorityId: z.uuid(),
  canonicalOrigin: z
    .url({ protocol: /^https?$/ })
    .refine((value) => value === new URL(value).origin),
  pid: z.int().positive(),
  revision: z.int().nonnegative(),
  processStart: z.string().regex(/^\d+$/),
  state: z.strictObject({
    endpoint: HUB_ENDPOINT.nullable(),
    routeGeneration: z.int().nonnegative(),
    networkGeneration: z.int().nonnegative(),
    localSupported: z.boolean(),
    detail: z.string().max(500),
  }),
  trust: NATIVE_HUB_TRUST.nullable(),
});
export type NodeRouteView = z.infer<typeof NODE_ROUTE_VIEW>;
export class NodeRouteViewWriter {
  readonly id = randomUUID();
  private readonly path: string;
  private writing: Promise<void> = Promise.resolve();
  private unsubscribe: (() => void) | null = null;
  private stopped = false;
  private revision = 0;
  private constructor(
    directory: string,
    private readonly authority: NodeRouteAuthority,
    private readonly log: Logger,
    readonly processStart: string,
  ) {
    this.path = join(directory, NODE_ROUTE_VIEW_FILE);
  }
  static async start(
    directory: string,
    authority: NodeRouteAuthority,
    log: Logger,
  ): Promise<NodeRouteViewWriter | null> {
    if (process.platform !== 'linux') return null;
    const writer = new NodeRouteViewWriter(
      directory,
      authority,
      log,
      await serviceProcessStart(process.pid),
    );
    writer.unsubscribe = authority.observe((): void => {
      writer.changed();
    });
    writer.writing = writer.persist();
    await writer.writing;
    return writer;
  }
  changed(): void {
    this.writing = this.writing
      .then(() => this.persist())
      .catch((cause: unknown): void => {
        this.log.error('route.view_write_failed', cause);
      });
  }
  private async persist(): Promise<void> {
    if (this.stopped) return;
    const view = NODE_ROUTE_VIEW.parse({
      authorityId: this.id,
      revision: ++this.revision,
      processStart: this.processStart,
      pid: process.pid,
      ...this.authority.view,
    });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(view)}\n`, { mode: 0o600, flag: 'wx' });
      await rename(temporary, this.path);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async stop(): Promise<void> {
    this.stopped = true;
    this.unsubscribe?.();
    await this.writing;
    await rm(this.path, { force: true });
  }
}
