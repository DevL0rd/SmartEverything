import type { IncomingMessage } from 'node:http';
import { getDefaultHighWaterMark, type Duplex } from 'node:stream';
import { ApiError, type ComputerNodeRow } from '@smarteverything/domain';
import {
  FrameError,
  MAX_FRAME_BYTES,
  MOUNT_SUBPROTOCOL,
  OPS,
  PING_INTERVAL_MS,
  PONG_TIMEOUT_MS,
  REQUEST_META,
  decodeFrame,
  decodeMeta,
  type Frame,
} from '@smarteverything/domain/drive-mount';
import { background, messageOf, type Logger } from '@smarteverything/logging';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import type { ComputerNodeAccess } from '../../computers/node-access';
import { ConnectionHeartbeat } from '../../network/connection-heartbeat';
import { pingWhenOpen } from '../../network/guarded-socket';
import { profileIdOf } from '../../server/auth';
import { bearerOf } from '../../server/http';
import type { Store } from '../../store/store';
import { nodeCaller } from '../node-caller';
import type { PosixCaller } from '../posix/env';
import { errorFrame, pushFrame, replyFrame } from './frames';
import type { DriveMount } from './service';
import { Outbox } from './outbox';
import type { MountLink, MountSession } from './session';

const CLOSE_POLICY = 1008;
const CLOSE_UNSUPPORTED = 1003;
const CLOSE_REVOKED = 4001;
const REASON_LIMIT = 120;

class Connection {
  private bound: MountSession | null = null;
  private held: Frame[] | null = null;
  closed = false;
  private pong = Date.now();
  private writes = 0;
  private paused = false;

  constructor(
    readonly socket: WebSocket,
    readonly caller: PosixCaller,
    readonly link: MountLink,
    private readonly writeSlots: number,
  ) {}

  holdWrite(done: Promise<void>): void {
    this.writes += 1;
    if (!this.paused && this.writes >= this.writeSlots) {
      this.paused = true;
      this.socket.pause();
    }
    background(
      done.finally(() => {
        this.writes -= 1;
        if (this.paused && this.writes < this.writeSlots) {
          this.paused = false;
          this.socket.resume();
        }
      }),
      'drive_mount.operation_failed',
    );
  }

  get session(): MountSession | null {
    return this.bound;
  }

  get waiting(): Frame[] | null {
    return this.held;
  }

  hold(frames: Frame[] | null): void {
    this.held = frames;
  }

  bind(session: MountSession): void {
    this.bound = session;
  }

  get lastPongAt(): number {
    return this.pong;
  }

  ponged(): void {
    this.pong = Date.now();
  }
}

function bytesOf(raw: RawData): Uint8Array {
  if (Array.isArray(raw)) return Buffer.concat(raw);
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  return raw;
}

export type MountAccess = Pick<ComputerNodeAccess, 'authenticate'>;

export class DriveMountSocket {
  private readonly server: WebSocketServer;
  private readonly connections = new Set<Connection>();
  private readonly heartbeat = new ConnectionHeartbeat(PING_INTERVAL_MS, () => this.beat());

  constructor(
    private readonly store: Store,
    private readonly access: MountAccess,
    private readonly mount: DriveMount,
    private readonly options: { readonly log: Logger; readonly writeSlots: () => number },
  ) {
    this.server = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_FRAME_BYTES,
      perMessageDeflate: false,
      handleProtocols: (protocols): string | false =>
        protocols.has(MOUNT_SUBPROTOCOL) ? MOUNT_SUBPROTOCOL : false,
    });
  }

  async upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const offered = (request.headers['sec-websocket-protocol'] ?? '')
      .split(',')
      .map((value) => value.trim());
    if (!offered.includes(MOUNT_SUBPROTOCOL)) {
      throw new ApiError(
        'invalid_request',
        `Open this socket with the ${MOUNT_SUBPROTOCOL} subprotocol.`,
      );
    }
    const node = await this.authenticated(request);
    const caller = await this.callerOf(node);
    this.server.handleUpgrade(request, socket, head, (ws) => {
      this.accept(ws, caller);
    });
  }

  private async authenticated(request: IncomingMessage): Promise<ComputerNodeRow> {
    try {
      return await this.access.authenticate(bearerOf(request));
    } catch (cause) {
      this.options.log.warn('drive_mount.refused_upgrade', { reason: messageOf(cause) });
      throw cause;
    }
  }

  private async callerOf(node: ComputerNodeRow): Promise<PosixCaller> {
    return {
      profileId: profileIdOf(await nodeCaller(this.store, node)),
      nodeId: node.device_id,
    };
  }

  revoke(deviceId: string): void {
    for (const connection of this.connections) {
      if (connection.caller.nodeId === deviceId)
        connection.socket.close(CLOSE_REVOKED, 'Computer access revoked');
    }
  }

  stop(): void {
    this.heartbeat.stop();
    for (const connection of this.connections) connection.socket.terminate();
    this.connections.clear();
    this.server.close();
  }

  private accept(socket: WebSocket, caller: PosixCaller): void {
    const outbox = new Outbox(
      {
        send: (bytes, written): void => {
          socket.send(bytes, { binary: true }, written);
        },
      },
      (failure): void => {
        this.options.log.warn('drive_mount.send_failed', { reason: messageOf(failure) });
      },
      getDefaultHighWaterMark(false),
    );
    const link: MountLink = {
      send: (bytes) => {
        outbox.send(bytes);
      },
      close: (code, reason) => {
        socket.close(code, reason);
      },
    };
    const connection = new Connection(socket, caller, link, this.options.writeSlots());
    this.connections.add(connection);
    this.heartbeat.start();
    socket.on('message', (raw: RawData, binary: boolean) => {
      this.receive(connection, raw, binary);
    });
    socket.on('pong', () => {
      connection.ponged();
    });
    socket.on('error', (cause: Error) => {
      this.options.log.warn('drive_mount.socket_error', { reason: messageOf(cause) });
    });
    socket.on('close', () => {
      connection.closed = true;
      outbox.stop();
      this.connections.delete(connection);
      if (connection.session !== null)
        this.mount.services.registry.detach(connection.session, link);
    });
  }

  private receive(connection: Connection, raw: RawData, binary: boolean): void {
    if (!binary) {
      connection.socket.close(CLOSE_UNSUPPORTED, 'Mount frames are binary.');
      return;
    }
    let frame: Frame;
    try {
      frame = decodeFrame(bytesOf(raw));
    } catch (cause) {
      this.refuse(connection, cause);
      return;
    }
    if (connection.waiting !== null) {
      connection.waiting.push(frame);
      return;
    }
    this.route(connection, frame);
  }

  private route(connection: Connection, frame: Frame): void {
    if (frame.op === OPS.HELLO.code) {
      this.greet(connection, frame);
    } else if (connection.session === null) {
      connection.socket.close(CLOSE_POLICY, 'Say hello before sending anything else.');
    } else {
      const done = this.mount.dispatch.handle(connection.session, connection.link, frame);
      if (frame.op === OPS.WRITE.code) connection.holdWrite(done);
      else background(done, 'drive_mount.operation_failed');
    }
  }

  private refuse(connection: Connection, cause: unknown): void {
    this.options.log.warn('drive_mount.refused_frame', { reason: messageOf(cause) });
    const reason = cause instanceof FrameError ? cause.fault : 'invalid frame';
    connection.socket.close(CLOSE_POLICY, reason.slice(0, REASON_LIMIT));
  }

  private greet(connection: Connection, frame: Frame): void {
    if (connection.session !== null || frame.type !== 'request') {
      connection.socket.close(CLOSE_POLICY, 'This channel already said hello.');
      return;
    }
    const waiting: Frame[] = [];
    connection.hold(waiting);
    background(this.greeted(connection, frame, waiting), 'drive_mount.hello_failed');
  }

  private async greeted(connection: Connection, frame: Frame, waiting: Frame[]): Promise<void> {
    try {
      const request = decodeMeta(REQUEST_META.HELLO, frame.meta);
      const greeting = await this.mount.services.registry.hello(
        connection.link,
        connection.caller,
        request,
      );
      connection.bind(greeting.session);
      if (connection.closed) {
        this.mount.services.registry.detach(greeting.session, connection.link);
        return;
      }
      connection.link.send(replyFrame('HELLO', frame.requestId, greeting.reply, null));
      this.afterHello(greeting.session, greeting.lost, greeting.reply.resumed);
    } catch (cause) {
      this.options.log.warn('drive_mount.refused_hello', { reason: messageOf(cause) });
      connection.link.send(
        errorFrame(frame.op, frame.requestId, { code: 'EINVAL', message: messageOf(cause) }),
      );
    } finally {
      connection.hold(null);
      for (const next of waiting) this.route(connection, next);
    }
  }

  private afterHello(
    session: MountSession,
    lost: readonly { readonly ino: number; readonly owner: { readonly owner: bigint } }[],
    resumed: boolean,
  ): void {
    for (const lock of lost)
      session.link?.send(pushFrame('LOCK_LOST', { ino: lock.ino, owner: lock.owner.owner }));
    if (!resumed) return;
    for (const attachment of session.attachments.values()) {
      background(this.mount.services.push.pump(session, attachment), 'drive_mount.push_failed');
    }
  }

  private beat(): boolean {
    const now = Date.now();
    for (const connection of this.connections) {
      if (now - connection.lastPongAt > PONG_TIMEOUT_MS) {
        connection.socket.terminate();
        continue;
      }
      pingWhenOpen(connection.socket);
    }
    return this.connections.size > 0;
  }
}
