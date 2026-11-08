import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  API_ENDPOINTS as E,
  type DriveItemLink,
  type NativeHubResourcePurpose,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { routeFor } from '../../../api/connection/active-route';
import { connectionState } from '../../../api/connection/connection';
import { api } from '../../../api/transport';

const log = new Logger('app.drive');

export const LINK_RENEW_LEAD_MS = 60_000;

export type DriveLinkSize = 'file' | 'thumb' | 'preview';

interface Entry {
  readonly generation: number;
  readonly url: string;
  readonly expiresAt: number;
}

interface Batch {
  readonly ids: Set<string>;
  readonly done: Promise<void>;
}

export type ReadLinks = (itemIds: readonly string[]) => Promise<readonly DriveItemLink[]>;

export type RouteGeneration = () => number;

function keyOf(itemId: string, rev: number, size: DriveLinkSize, generation: number): string {
  return `${itemId}\n${String(rev)}\n${size}\n${String(generation)}`;
}

function routeStore(): ReturnType<typeof routeFor>['state'] | null {
  const state = connectionState.get();
  return state.status === 'paired' ? routeFor(state.connection).state : null;
}

export function routeGeneration(): number {
  return routeStore()?.get().generation ?? 0;
}

function subscribeGeneration(listener: () => void): () => void {
  let release = routeStore()?.subscribe(listener);
  const releaseConnection = connectionState.subscribe(() => {
    release?.();
    release = routeStore()?.subscribe(listener);
    listener();
  });
  return (): void => {
    release?.();
    releaseConnection();
  };
}

const PURPOSE: Readonly<Record<DriveLinkSize, NativeHubResourcePurpose>> = {
  file: 'attachment',
  thumb: 'image',
  preview: 'image',
};

export async function readRoutedDriveLinks(
  itemIds: readonly string[],
): Promise<readonly DriveItemLink[]> {
  const client = api().forMedia();
  const links = await client.call(E.itemLinks, { body: { itemIds: [...itemIds] } });
  const present = async (
    link: DriveItemLink['file'],
    size: DriveLinkSize,
  ): Promise<DriveItemLink['file']> => ({
    url: await client.resourceUrl(link.url, link.expiresAt, PURPOSE[size]),
    expiresAt: link.expiresAt,
  });
  const optional = (
    link: DriveItemLink['file'] | null,
    size: DriveLinkSize,
  ): Promise<DriveItemLink['file'] | null> =>
    link === null ? Promise.resolve(null) : present(link, size);
  return Promise.all(
    links.map(async (link) => {
      const [file, thumb, preview] = await Promise.all([
        present(link.file, 'file'),
        optional(link.thumb, 'thumb'),
        optional(link.preview, 'preview'),
      ]);
      return { ...link, file, thumb, preview };
    }),
  );
}

export class DriveLinkCache {
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<void>>();
  private batch: Batch | null = null;

  constructor(
    private readonly read: ReadLinks,
    private readonly now: () => number,
    private readonly generation: RouteGeneration,
  ) {}

  clear(): void {
    this.entries.clear();
  }

  async resolve(itemId: string, rev: number, size: DriveLinkSize): Promise<string | null> {
    const cached = this.fresh(itemId, rev, size);
    if (cached !== null) return cached;
    await this.request(itemId);
    return this.fresh(itemId, rev, size);
  }

  private fresh(itemId: string, rev: number, size: DriveLinkSize): string | null {
    const entry = this.entries.get(keyOf(itemId, rev, size, this.generation()));
    if (entry === undefined) return null;
    return entry.expiresAt - this.now() > LINK_RENEW_LEAD_MS ? entry.url : null;
  }

  private request(itemId: string): Promise<void> {
    const running = this.inflight.get(itemId);
    if (running !== undefined) return running;
    const batch = this.batch ?? this.open();
    batch.ids.add(itemId);
    this.inflight.set(itemId, batch.done);
    return batch.done;
  }

  private open(): Batch {
    const ids = new Set<string>();
    const done = Promise.resolve().then(() => this.fetch(ids));
    const batch = { ids, done };
    this.batch = batch;
    return batch;
  }

  private async fetch(ids: ReadonlySet<string>): Promise<void> {
    this.batch = null;
    try {
      const generation = this.generation();
      const links = await this.read([...ids]);
      this.store(links, generation);
    } finally {
      for (const id of ids) this.inflight.delete(id);
    }
  }

  private store(links: readonly DriveItemLink[], generation: number): void {
    this.sweep();
    for (const link of links) {
      this.put(link, 'file', link.file, generation);
      if (link.thumb !== null) this.put(link, 'thumb', link.thumb, generation);
      if (link.preview !== null) this.put(link, 'preview', link.preview, generation);
    }
  }

  private put(
    owner: DriveItemLink,
    size: DriveLinkSize,
    link: DriveItemLink['file'],
    generation: number,
  ): void {
    this.entries.set(keyOf(owner.itemId, owner.rev, size, generation), {
      generation,
      url: link.url,
      expiresAt: Date.parse(link.expiresAt),
    });
  }

  private sweep(): void {
    const now = this.now();
    const current = this.generation();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now || entry.generation !== current) this.entries.delete(key);
    }
  }
}

export const driveLinks = new DriveLinkCache(readRoutedDriveLinks, Date.now, routeGeneration);

export function useDriveLink(
  itemId: string | null,
  rev: number,
  size: DriveLinkSize,
): string | null {
  const [resolved, setResolved] = useState<{ readonly key: string; readonly url: string } | null>(
    null,
  );
  const generation = useSyncExternalStore(subscribeGeneration, routeGeneration, routeGeneration);
  const key = itemId === null ? null : keyOf(itemId, rev, size, generation);
  useEffect(() => {
    if (itemId === null || key === null) return undefined;
    let current = true;
    driveLinks
      .resolve(itemId, rev, size)
      .then((url) => {
        if (current && url !== null) setResolved({ key, url });
      })
      .catch((error: unknown) => {
        log.error('links.resolve_failed', error, { size });
      });
    return (): void => {
      current = false;
    };
  }, [itemId, rev, size, key]);
  return resolved !== null && resolved.key === key ? resolved.url : null;
}
