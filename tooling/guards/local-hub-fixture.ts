import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { HubLayout } from '../../apps/hub/src/data-layout/index.ts';
import { localHub } from '../local-hub.ts';
import type { PublisherTarget } from '../machine-update-client.ts';

export interface AnnouncedHub {
  readonly url: URL;
  readonly layout: HubLayout;
  readonly tokenFor: (role: 'owner' | 'member') => string;
}

async function writeInto(file: string, text: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text, { mode: 0o600 });
}

export async function announceHub(
  hub: AnnouncedHub,
  role: 'owner' | 'member',
): Promise<PublisherTarget> {
  await writeInto(
    hub.layout.system.run.ready,
    JSON.stringify({ pid: process.pid, url: hub.url.origin, version: '0.0.0' }),
  );
  await writeInto(hub.layout.system.keys.ownerToken, `${hub.tokenFor(role)}\n`);
  return localHub(hub.layout);
}
