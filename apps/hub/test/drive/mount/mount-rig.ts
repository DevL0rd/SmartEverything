import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import type { ComputerNodeRow } from '@smarteverything/domain';
import {
  ERROR_META,
  MOUNT_SUBPROTOCOL,
  OPS,
  PUSH_META,
  REPLY_META,
  REQUEST_META,
  decodeFrame,
  decodeKeyed,
  decodeMeta,
  encodeFrame,
  encodeMeta,
  errorNameOf,
  opNameOf,
  type PushMeta,
  type PushName,
  type ReplyMeta,
  type RequestMetaInput,
  type RequestOpName,
} from '@smarteverything/domain/drive-mount';
import WebSocket from 'ws';
import { DriveMount } from '../../../src/drive/mount/service';
import { DriveActivity } from '../../../src/drive/activity';
import { DriveMountSocket, type MountAccess } from '../../../src/drive/mount/socket';
import { testLogger } from '../../support/logs';
import { bundleWorker } from '../drive-fixture';
import { insertMount } from '../placement-fixture';
import { openPosixRig, type PosixRig } from '../posix/posix-rig';
import { loadDriveSettings } from '../../../src/drive/settings';

const WRITE_SLOTS = 8;

export class MountFailure extends Error {
  constructor(
    readonly code: string,
    readonly rev: number | undefined,
  ) {
    super(code);
  }
}

export interface Reply<Name extends RequestOpName> {
  readonly meta: ReplyMeta<Name>;
  readonly payload: Uint8Array | null;
}

export interface Pushed {
  readonly name: PushName;
  readonly meta: Uint8Array;
}

export interface Hello {
  readonly session?: Uint8Array<ArrayBuffer> | null;
  readonly seqs?: { root: string; seq: number }[];
  readonly commits?: number[];
  readonly locks?: RequestMetaInput<'HELLO'>['locks'];
}

export async function until(condition: () => boolean, label = 'condition'): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}.`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

export class TestClient {
  private readonly waiting = new Map<
    bigint,
    { resolve: (value: Uint8Array) => void; name: RequestOpName }
  >();
  private counter = 0n;
  readonly pushes: Pushed[] = [];
  session: Uint8Array<ArrayBuffer> | null = null;

  constructor(readonly socket: WebSocket) {
    socket.on('message', (raw: Buffer) => {
      const frame = decodeFrame(raw);
      if (frame.type === 'push') {
        const name = opNameOf(frame.op);
        if (name === 'CHANGED' || name === 'RESET' || name === 'LOCK_LOST') {
          this.pushes.push({ name, meta: frame.meta });
        }
        return;
      }
      const entry = this.waiting.get(frame.requestId);
      if (entry === undefined) return;
      this.waiting.delete(frame.requestId);
      entry.resolve(raw);
    });
  }

  static open(port: number, token: string): Promise<TestClient> {
    const socket = new WebSocket(
      `ws://127.0.0.1:${String(port)}/drive/mount`,
      [MOUNT_SUBPROTOCOL],
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );
    return new Promise((resolve, reject) => {
      socket.once('open', () => {
        resolve(new TestClient(socket));
      });
      socket.once('unexpected-response', (_request, response) => {
        reject(new Error(`refused with ${String(response.statusCode)}`));
      });
      socket.once('error', reject);
    });
  }

  request<Name extends RequestOpName>(
    name: Name,
    meta: RequestMetaInput<Name>,
    payload: Uint8Array | null = null,
  ): { id: bigint; sent: Promise<Reply<Name>> } {
    this.counter += 1n;
    const id = this.counter;
    const wire = encodeFrame({
      type: 'request',
      op: OPS[name].code,
      requestId: id,
      more: false,
      meta: encodeMeta(REQUEST_META[name], meta),
      payload,
    });
    const sent = new Promise<Reply<Name>>((resolve, reject) => {
      this.waiting.set(id, {
        name,
        resolve: (bytes) => {
          const frame = decodeFrame(bytes);
          if (frame.type === 'error') {
            const failure = decodeMeta(ERROR_META, frame.meta);
            reject(new MountFailure(errorNameOf(failure.code) ?? 'UNKNOWN', failure.rev));
            return;
          }
          resolve({ meta: decodeKeyed(REPLY_META, name, frame.meta), payload: frame.payload });
        },
      });
    });
    this.socket.send(wire, { binary: true });
    return { id, sent };
  }

  private leased: { next: number; end: number } = { next: 0, end: 0 };

  async ino(): Promise<number> {
    if (this.leased.next >= this.leased.end) {
      const lease = await this.call('LEASE', { count: 256 });
      this.leased = { next: lease.start, end: lease.start + lease.count };
    }
    const ino = this.leased.next;
    this.leased.next += 1;
    return ino;
  }

  async created(
    parent: number,
    name: string,
    content: Uint8Array = new Uint8Array(),
  ): Promise<ReplyMeta<'CREATE'>> {
    return this.call(
      'CREATE',
      {
        parent,
        name,
        ino: await this.ino(),
        mode: 0o644,
        uid: null,
        gid: null,
        mtimeNs: 1_763_100_000_000_000_000n,
        fsync: false,
        opKey: new Uint8Array(randomBytes(16)),
      },
      content,
    );
  }

  async call<Name extends RequestOpName>(
    name: Name,
    meta: RequestMetaInput<Name>,
    payload: Uint8Array | null = null,
  ): Promise<ReplyMeta<Name>> {
    return (await this.request(name, meta, payload).sent).meta;
  }

  async hello(extra: Hello = {}): Promise<ReplyMeta<'HELLO'>> {
    const reply = await this.call('HELLO', {
      session: extra.session === undefined ? this.session : extra.session,
      seqs: extra.seqs ?? [],
      handles: [],
      locks: extra.locks ?? [],
      commits: extra.commits ?? [],
    });
    this.session = reply.session;
    return reply;
  }

  pushed<Name extends PushName>(name: Name): PushMeta<Name>[] {
    return this.pushes
      .filter((entry) => entry.name === name)
      .map((entry) => decodeKeyed(PUSH_META, name, entry.meta));
  }

  close(): void {
    this.socket.terminate();
  }
}

export interface MountRig {
  readonly posix: PosixRig;
  readonly mount: DriveMount;
  readonly activity: DriveActivity;
  readonly port: number;
  readonly tokenOf: (nodeId: string) => string;
  readonly placementOf: (
    nodeId: string,
    profileId: string,
    rootId: string,
    base?: string,
  ) => string;
  readonly connect: (nodeId: string) => Promise<TestClient>;
  readonly revoke: (nodeId: string) => void;
  readonly close: () => Promise<void>;
}

interface Tokens {
  readonly access: MountAccess;
  readonly tokenOf: (nodeId: string) => string;
}

function tokensOf(): Tokens {
  const tokens = new Map<string, ComputerNodeRow>();
  return {
    tokenOf: (nodeId): string => {
      const token = `sen_${randomBytes(20).toString('hex')}`;
      tokens.set(token, {
        device_id: nodeId,
        machine_id: '0'.repeat(32),
        hub_url: 'http://hub.test',
        paired_at: '2026-11-07T00:00:00.000Z',
        revoked_at: null,
      });
      return token;
    },
    access: {
      authenticate: (token): Promise<ComputerNodeRow> => {
        const node = token === null ? undefined : tokens.get(token);
        if (node === undefined) throw new Error('unknown token');
        return Promise.resolve(node);
      },
    },
  };
}

async function listen(socket: DriveMountSocket): Promise<{ server: Server; port: number }> {
  const server = createServer((_request, response) => {
    response.writeHead(404).end();
  });
  server.on('upgrade', (request, connection: Duplex, head) => {
    socket.upgrade(request, connection, head).catch((cause: unknown) => {
      connection.write('HTTP/1.1 401 Unauthorized\r\nconnection: close\r\n\r\n');
      connection.destroy();
      if (!(cause instanceof Error)) throw cause;
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return { server, port: address.port };
}

function placerOf(posix: PosixRig): MountRig['placementOf'] {
  const { store } = posix.opened;
  let mounts = 0;
  return (nodeId, profileId, rootId, base): string => {
    const known = store.drivePlacements
      .forDevice(nodeId)
      .find((row) => row.rootId === rootId && row.folderItemId === (base ?? null));
    if (known !== undefined) return known.id;
    mounts += 1;
    return insertMount(
      store,
      { profileId },
      {
        deviceId: nodeId,
        rootId,
        folderItemId: base ?? null,
        mountName: `mount-${String(mounts)}`,
      },
    ).id;
  };
}

async function mountEnvOf(
  posix: PosixRig,
  activity: DriveActivity,
  tuning: { readonly leaseMs: number; readonly hashWorker: string },
): Promise<ConstructorParameters<typeof DriveMount>[0]> {
  return {
    store: posix.opened.store,
    change: posix.env.change,
    guard: posix.env.guard,
    space: posix.env.space,
    activity,
    lanes: posix.env.lanes,
    log: testLogger('drive'),
    settings: await loadDriveSettings(posix.opened.store),
    ...tuning,
  };
}

export async function openMountRig(leaseMs = 90_000, history = false): Promise<MountRig> {
  const posix = await openPosixRig(history);
  const { access, tokenOf } = tokensOf();
  const workers = await mkdtemp(join(tmpdir(), 'mount-hash-'));
  const hashWorker = join(workers, 'mount-hash-worker.mjs');
  await bundleWorker('mount/hash-worker.ts', hashWorker);
  const activity = new DriveActivity();
  const mount = new DriveMount(await mountEnvOf(posix, activity, { leaseMs, hashWorker }));
  const socket = new DriveMountSocket(posix.opened.store, access, mount, {
    log: testLogger('drive'),
    writeSlots: (): number => WRITE_SLOTS,
  });
  const { server, port } = await listen(socket);
  const clients: TestClient[] = [];
  return {
    posix,
    mount,
    activity,
    port,
    tokenOf,
    placementOf: placerOf(posix),
    revoke: (nodeId): void => {
      socket.revoke(nodeId);
    },
    connect: async (nodeId): Promise<TestClient> => {
      const client = await TestClient.open(port, tokenOf(nodeId));
      clients.push(client);
      return client;
    },
    close: async (): Promise<void> => {
      for (const client of clients) client.close();
      socket.stop();
      mount.stop();
      server.closeAllConnections();
      server.close();
      await posix.close();
      await rm(workers, { recursive: true, force: true });
    },
  };
}

export interface Attached {
  readonly client: TestClient;
  readonly root: number;
  readonly rootId: string;
  readonly placementId: string;
}

export function opKey(): Uint8Array<ArrayBuffer> {
  return new Uint8Array(randomBytes(16));
}

export async function attachTo(
  rig: MountRig,
  who: { readonly nodeId: string; readonly profileId: string },
  rootId: string,
  base?: string,
): Promise<Attached> {
  const client = await rig.connect(who.nodeId);
  await client.hello();
  const placementId = rig.placementOf(who.nodeId, who.profileId, rootId, base);
  const reply = await client.call('ATTACH', { placementId });
  return { client, root: reply.ino, rootId, placementId };
}
