import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { NODE_PROTOCOL_VERSION } from '../../packages/domain/src/node/frames.ts';
import { files, type ComputerName } from './paths.ts';
import { waitFor } from './processes.ts';

const LOOPBACK = '127.0.0.1';
const REQUEST_TIMEOUT_MS = 30_000;
const INDEX_TIMEOUT_MS = 60_000;

const IDENTITY = z.object({
  identity: z.object({
    tls: z.object({
      serverName: z.string().min(1),
      publicKeySha256: z.string().regex(/^[0-9a-f]{64}$/u),
    }),
  }),
});

const PAIRING = z.object({ code: z.string().min(1) });

const PAIRED = z.object({ token: z.string().min(1), device_id: z.uuid() });

const ROOTS = z.array(
  z.looseObject({
    id: z.uuid(),
    scope: z.enum(['home', 'person']),
    ownerProfileId: z.uuid().nullable(),
  }),
);

const ID_ONLY = z.looseObject({ id: z.uuid() });

const BROWSE = z.object({
  items: z.array(z.looseObject({ id: z.uuid(), name: z.string(), kind: z.string() })),
  next: z.string().nullable(),
});

export interface DriveRoots {
  readonly owner: string;
  readonly home: string;
  readonly ownerFolder: string;
  readonly homeFolder: string;
}

export interface PairedComputer {
  readonly deviceId: string;
  readonly machineId: string;
  readonly token: string;
}

export function httpUrl(port: number): string {
  return `http://${LOOPBACK}:${String(port)}`;
}

async function call<S extends z.ZodType>(
  schema: S,
  url: string,
  init: { readonly method?: string; readonly token?: string; readonly body?: unknown },
): Promise<z.output<S>> {
  const method = init.method ?? 'GET';
  const response = await fetch(url, {
    method,
    headers: {
      ...(init.token === undefined ? {} : { authorization: `Bearer ${init.token}` }),
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(`${method} ${url} answered ${String(response.status)}: ${text}`);
  return schema.parse(JSON.parse(text));
}

export async function hubIdentity(
  http: number,
): Promise<{ readonly serverName: string; readonly pin: string }> {
  const { identity } = await call(
    IDENTITY,
    `${httpUrl(http)}/.well-known/smarteverything/identity`,
    {},
  );
  return { serverName: identity.tls.serverName, pin: identity.tls.publicKeySha256 };
}

export async function driveRoots(http: number, token: string): Promise<DriveRoots> {
  const roots = await call(ROOTS, `${httpUrl(http)}/api/drive/roots`, { token });
  const owner = roots.find((root) => root.scope === 'person');
  const home = roots.find((root) => root.scope === 'home');
  if (owner?.ownerProfileId === undefined || owner.ownerProfileId === null || home === undefined)
    throw new Error('The test Hub has no personal or shared drive root.');
  return {
    owner: owner.id,
    home: home.id,
    ownerFolder: join(files.data, 'people', owner.ownerProfileId, 'drive'),
    homeFolder: join(files.data, 'home', 'drive'),
  };
}

export async function createMember(http: number, token: string): Promise<string> {
  const profile = await call(ID_ONLY, `${httpUrl(http)}/api/profiles`, {
    method: 'POST',
    token,
    body: { name: 'Rig Member' },
  });
  return profile.id;
}

function hello(name: ComputerName, machineId: string): object {
  return {
    protocol: NODE_PROTOCOL_VERSION,
    machineId,
    hostname: `rig-${name}`,
    os: { name: 'linux', kernel: 'rig' },
    hardware: { vendor: null, product: null, portable: false },
    cpu: { model: 'rig', threads: 2, hybrid: false },
    memoryBytes: 1 << 30,
    interfaces: [],
    bootedAt: new Date().toISOString(),
  };
}

export async function pairComputer(
  http: number,
  ownerKey: string,
  name: ComputerName,
): Promise<PairedComputer> {
  const machineId = randomBytes(16).toString('hex');
  const pairing = await call(PAIRING, `${httpUrl(http)}/api/nodes/pairing`, {
    method: 'POST',
    token: ownerKey,
    body: { url: 'https://rig-hub.test:7882' },
  });
  const paired = await call(PAIRED, `${httpUrl(http)}/api/nodes/pairing/claim`, {
    method: 'POST',
    body: { code: pairing.code, hello: hello(name, machineId) },
  });
  return { deviceId: paired.device_id, machineId, token: paired.token };
}

export async function placeDrive(
  http: number,
  token: string,
  placement: { readonly deviceId: string; readonly rootId: string; readonly mountName: string },
): Promise<string> {
  const placed = await call(ID_ONLY, `${httpUrl(http)}/api/drive/placements`, {
    method: 'PUT',
    token,
    body: {
      deviceId: placement.deviceId,
      rootId: placement.rootId,
      folderItemId: null,
      mode: 'mounted',
      localPath: null,
      mountName: placement.mountName,
      enabled: true,
    },
  });
  return placed.id;
}

export async function mountDrive(http: number, token: string, deviceId: string): Promise<string> {
  const mounted = await call(ID_ONLY, `${httpUrl(http)}/api/drive/mount`, {
    method: 'PUT',
    token,
    body: { deviceId, enabled: true },
  });
  return mounted.id;
}

async function findFolder(
  http: number,
  token: string,
  rootId: string,
  name: string,
): Promise<string | undefined> {
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ rootId });
    if (cursor !== null) query.set('cursor', cursor);
    const page = await call(BROWSE, `${httpUrl(http)}/api/drive/browse?${query.toString()}`, {
      token,
    });
    const found = page.items.find((item) => item.kind === 'folder' && item.name === name);
    if (found !== undefined) return found.id;
    cursor = page.next;
  } while (cursor !== null);
  return undefined;
}

export async function ensureFolder(
  http: number,
  token: string,
  placement: { readonly rootId: string; readonly directory: string },
  name: string,
): Promise<string> {
  await mkdir(join(placement.directory, name), { recursive: true, mode: 0o755 });
  await call(z.unknown(), `${httpUrl(http)}/api/drive/roots/${placement.rootId}/scan`, {
    method: 'POST',
    token,
  });
  return waitFor(
    `the Hub to index the folder ${name}`,
    () => findFolder(http, token, placement.rootId, name),
    INDEX_TIMEOUT_MS,
    500,
  );
}
