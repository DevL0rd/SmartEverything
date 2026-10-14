import { inspect } from 'node:util';
import { PUBLIC_STATUS, PUBLIC_URL_CHECK, SNAPSHOT } from '@smarteverything/domain';
import type { ServiceReady } from '@smarteverything/hub/service/configuration';
import type { ServiceLocations } from '../service/locations.js';
import { readOwnerToken, readReady } from '../service/ready.js';
import type { ServiceSystem } from '../service/system.js';

const REQUEST_TIMEOUT_MS = 30_000;

export interface HubFacts {
  readonly pid: number;
  readonly version: string;
  readonly devices: number;
  readonly providerLinks: number;
  readonly publicUrl: 'verified' | 'not-configured';
}

export class HubCheckError extends Error {
  override readonly name = 'HubCheckError';
}

async function json(system: ServiceSystem, url: URL, init: RequestInit): Promise<unknown> {
  const response = await system.fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new HubCheckError(`${url.pathname} answered HTTP ${String(response.status)}`);
  }
  return response.json();
}

async function publicUrlOf(
  system: ServiceSystem,
  ready: Exclude<ServiceReady, { role: 'node' }>,
  token: string,
): Promise<HubFacts['publicUrl']> {
  const status = PUBLIC_STATUS.parse(await json(system, new URL('/status', ready.url), {}));
  if (!status.publicUrl.configured) {
    return 'not-configured';
  }
  const check = PUBLIC_URL_CHECK.parse(
    await json(system, new URL('/api/settings/public-url/verify', ready.url), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    }),
  );
  if (check.outcome === 'failed') {
    throw new HubCheckError(`the public URL didn't reach this server: ${check.reason}`);
  }
  return 'verified';
}

export async function readFacts(
  system: ServiceSystem,
  locations: ServiceLocations,
): Promise<HubFacts> {
  const ready = await readReady(system, locations);
  if (ready === null) {
    throw new HubCheckError(`the server isn't running (no live ${locations.readyFile})`);
  }
  if ('role' in ready)
    throw new HubCheckError('A paired computer node has no local hub database to migrate.');
  const token = await readOwnerToken(system, locations);
  const snapshot = SNAPSHOT.parse(
    await json(system, new URL('/api/snapshot', ready.url), {
      headers: { authorization: `Bearer ${token}` },
    }),
  );
  return {
    pid: ready.pid,
    version: ready.version,
    devices: snapshot.tables.devices.length,
    providerLinks: snapshot.tables.provider_links.length,
    publicUrl: await publicUrlOf(system, ready, token),
  };
}

export function waitForNewServer(
  system: ServiceSystem,
  locations: ServiceLocations,
  previousPid: number | null,
  timeoutMs: number,
): Promise<ServiceReady> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (outcome: ServiceReady | Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      stop();
      if (outcome instanceof Error) {
        reject(outcome);
      } else {
        resolve(outcome);
      }
    };
    const evaluate = (): void => {
      readReady(system, locations).then(
        (ready) => {
          if (ready !== null && ready.pid !== previousPid) {
            finish(ready);
          }
        },
        (cause: unknown) => {
          finish(cause instanceof Error ? cause : new HubCheckError(inspect(cause)));
        },
      );
    };
    const timer = setTimeout(() => {
      finish(
        new HubCheckError(`the server didn't become ready within ${String(timeoutMs / 1000)} s`),
      );
    }, timeoutMs);
    const stop = system.watch(locations.dataDirectory, {
      changed: evaluate,
      failed: (cause) => {
        finish(cause instanceof Error ? cause : new HubCheckError(inspect(cause)));
      },
    });
    evaluate();
  });
}
