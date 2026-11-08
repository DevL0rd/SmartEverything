import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type {
  AppUpdateCompatible,
  AppUpdateOffer,
  AppUpdateSummary,
  WebUpdateStatus,
} from '@smarteverything/domain';
import { afterEach, beforeEach } from 'vitest';
import { z } from 'zod';
import { WebBundleStore, type WebBuild } from '../../src/web-bundles/bundle-store.js';
import {
  WebUpdateController,
  type WebUpdateMode,
} from '../../src/web-bundles/web-update-controller.js';

export const RUNTIME = 'a'.repeat(32);
export const OTHER_RUNTIME = 'b'.repeat(32);
export const EMBEDDED_AT = '2026-10-01T00:00:00.000Z';
export const SERVER = { url: 'https://home.example:7880', token: 'set_token' };
export const PAGE = Buffer.alloc(1000, 'p');
export const SCRIPT = Buffer.from('console.log("entry")');

interface Home {
  compatible: AppUpdateCompatible | null;
  newerIncompatible: AppUpdateSummary | null;
  corrupt: boolean;
  rollback: boolean;
  readonly requests: Request[];
}

export interface Rig {
  readonly parent: string;
  readonly build: WebBuild;
  readonly store: WebBundleStore;
}

export function useRig(): Rig {
  let parent = '';
  let build: WebBuild = { runtime: RUNTIME, embeddedCreatedAt: EMBEDDED_AT, embeddedRoot: '' };
  let store = new WebBundleStore('');
  beforeEach(async () => {
    parent = await mkdtemp(path.join(tmpdir(), 'web-update-'));
    const embeddedRoot = path.join(parent, 'embedded');
    await mkdir(embeddedRoot);
    build = { runtime: RUNTIME, embeddedCreatedAt: EMBEDDED_AT, embeddedRoot };
    store = new WebBundleStore(path.join(parent, 'web-bundles'));
  });
  afterEach(async () => {
    await rm(parent, { recursive: true, force: true });
  });
  return {
    get parent(): string {
      return parent;
    },
    get build(): WebBuild {
      return build;
    },
    get store(): WebBundleStore {
      return store;
    },
  };
}

export function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function offerFor(id: string, createdAt: string): AppUpdateCompatible {
  return {
    id,
    createdAt,
    appVersion: '1.2.3',
    notes: 'a change',
    size: PAGE.length + SCRIPT.length,
    files: [
      {
        path: 'index.html',
        sha256: sha256(PAGE),
        size: PAGE.length,
        contentType: 'text/html',
        url: `/media/app-updates/${sha256(PAGE)}?expires=1&signature=ab`,
      },
      {
        path: '_expo/entry.js',
        sha256: sha256(SCRIPT),
        size: SCRIPT.length,
        contentType: 'text/javascript',
        url: `/media/app-updates/${sha256(SCRIPT)}?expires=1&signature=ab`,
      },
    ],
  };
}

export function chunked(bytes: Buffer, size: number): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller): void {
        for (let at = 0; at < bytes.length; at += size) {
          controller.enqueue(bytes.subarray(at, at + size));
        }
        controller.close();
      },
    }),
  );
}

export function homeServing(compatible: AppUpdateCompatible | null): {
  readonly home: Home;
  readonly fetch: typeof fetch;
} {
  const home: Home = {
    compatible,
    newerIncompatible: null,
    corrupt: false,
    rollback: false,
    requests: [],
  };
  const answer: typeof fetch = (input, init) => {
    const request = new Request(input, init);
    home.requests.push(request);
    const url = new URL(request.url);
    if (url.pathname === '/api/app-updates/latest') {
      const offer: AppUpdateOffer = {
        compatible: home.compatible,
        newerIncompatible: home.newerIncompatible,
        rollBackToEmbedded: home.rollback,
      };
      return Promise.resolve(Response.json(offer));
    }
    const bytes = url.pathname.endsWith(sha256(SCRIPT)) ? SCRIPT : PAGE;
    return Promise.resolve(chunked(home.corrupt ? Buffer.alloc(bytes.length, 'x') : bytes, 5));
  };
  return { home, fetch: answer };
}

export async function controllerFor(
  rig: Rig,
  fetchFrom: typeof fetch,
  options: { mode?: WebUpdateMode; connected?: boolean } = {},
): Promise<{ controller: WebUpdateController; statuses: WebUpdateStatus[] }> {
  const controller = await WebUpdateController.create({
    mode: options.mode ?? { kind: 'enabled', build: rig.build, store: rig.store },
    server: () => Promise.resolve(options.connected === false ? null : SERVER),
    fetch: fetchFrom,
  });
  const statuses: WebUpdateStatus[] = [];
  controller.onChange((status) => {
    statuses.push(status);
  });
  return { controller, statuses };
}

const STATE = z.object({ active: z.string(), trial: z.boolean(), failed: z.array(z.string()) });

export async function stateOf(rig: Rig): Promise<z.infer<typeof STATE>> {
  return STATE.parse(
    JSON.parse(await readFile(path.join(rig.store.directory, 'state.json'), 'utf8')),
  );
}
