import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { isMissing } from '../errors.ts';
import { NODE_PROTOCOL_VERSION } from '../../../packages/domain/src/node/frames.ts';
import { NAS, bench } from './paths.ts';
import { remote } from './ssh.ts';

const REQUEST_TIMEOUT_MS = 30_000;

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
const PLACEMENT = z.looseObject({ id: z.uuid() });
const SAVED = z.object({ deviceId: z.uuid(), placementId: z.uuid() });

export interface Production {
  readonly rootId: string;
  readonly deviceId: string;
  readonly placementId: string;
  readonly laneUrl: string;
  readonly serverName: string;
  readonly pin: string;
}

async function call<S extends z.ZodType>(
  schema: S,
  path: string,
  init: { readonly method?: string; readonly token?: string; readonly body?: unknown },
): Promise<z.output<S>> {
  const method = init.method ?? 'GET';
  const response = await fetch(`${NAS.publicUrl}${path}`, {
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
    throw new Error(`${method} ${path} answered ${String(response.status)}: ${text}`);
  return schema.parse(text === '' ? null : JSON.parse(text));
}

async function ownerKey(): Promise<string> {
  return (await remote(`cat ${NAS.ownerTokenFile}`)).trim();
}

function hello(machineId: string): object {
  return {
    protocol: NODE_PROTOCOL_VERSION,
    machineId,
    hostname: 'se-bench',
    os: { name: 'linux', kernel: 'bench' },
    hardware: { vendor: null, product: null, portable: false },
    cpu: { model: 'bench', threads: 2, hybrid: false },
    memoryBytes: 1 << 30,
    interfaces: [],
    bootedAt: new Date().toISOString(),
  };
}

export async function pairBenchComputer(): Promise<Production> {
  const key = await ownerKey();
  const { identity } = await call(IDENTITY, '/.well-known/smarteverything/identity', {});
  const roots = await call(ROOTS, '/api/drive/roots', { token: key });
  const person = roots.find((root) => root.scope === 'person');
  if (person === undefined) throw new Error('The production Hub has no personal drive root.');
  const pairing = await call(PAIRING, '/api/nodes/pairing', {
    method: 'POST',
    token: key,
    body: { url: NAS.publicUrl },
  });
  const paired = await call(PAIRED, '/api/nodes/pairing/claim', {
    method: 'POST',
    body: { code: pairing.code, hello: hello(randomBytes(16).toString('hex')) },
  });
  const placement = await call(PLACEMENT, '/api/drive/mount', {
    method: 'PUT',
    token: key,
    body: { deviceId: paired.device_id, enabled: true },
  });
  await mkdir(dirname(bench.token), { recursive: true, mode: 0o700 });
  await writeFile(bench.token, paired.token, { mode: 0o600 });
  await writeFile(
    bench.pairing,
    JSON.stringify({ deviceId: paired.device_id, placementId: placement.id }),
    { mode: 0o600 },
  );
  return {
    rootId: person.id,
    deviceId: paired.device_id,
    placementId: placement.id,
    laneUrl: NAS.lanUrl,
    serverName: identity.tls.serverName,
    pin: identity.tls.publicKeySha256,
  };
}

export async function revokeBenchComputer(): Promise<void> {
  let saved: z.infer<typeof SAVED>;
  try {
    saved = SAVED.parse(JSON.parse(await readFile(bench.pairing, 'utf8')));
  } catch (cause) {
    if (isMissing(cause)) return;
    throw cause;
  }
  const key = await ownerKey();
  await call(z.unknown(), `/api/drive/placements/${saved.placementId}`, {
    method: 'DELETE',
    token: key,
  });
  await call(z.unknown(), `/api/computers/${saved.deviceId}/node`, {
    method: 'DELETE',
    token: key,
  });
  await rm(bench.pairing, { force: true });
  await rm(bench.token, { force: true });
}
