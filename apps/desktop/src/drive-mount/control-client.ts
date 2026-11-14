import type { DesktopDriveState, DesktopDriveCommand } from '@smarteverything/domain';
import { connect, type Socket } from 'node:net';
import { createInterface } from 'node:readline';
import { messageOf, type Logger } from '@smarteverything/logging';
import { DRIVE_CONTROL_FRAME, type DriveControlRequest } from './control-protocol.js';

export class DriveControlUnavailableError extends Error {
  override readonly name = 'DriveControlUnavailableError';

  constructor() {
    super('The Computer service is not running, so this computer cannot sync or mount drives');
  }
}

export class DriveControlRefusedError extends Error {
  override readonly name = 'DriveControlRefusedError';
}

interface Pending {
  readonly resolve: (state: DesktopDriveState) => void;
  readonly reject: (cause: Error) => void;
}

export interface DriveControlClientOptions {
  readonly address: string;
  readonly retryMs: number;
  readonly log: Logger;
}

export class DriveControlClient {
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<(state: DesktopDriveState | null) => void>();
  private socket: Socket | null = null;
  private timer: NodeJS.Timeout | null = null;
  private latest: DesktopDriveState | null = null;
  private stopped = true;
  private next = 0;

  constructor(private readonly options: DriveControlClientOptions) {}

  get current(): DesktopDriveState | null {
    return this.latest;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.socket?.destroy();
    this.socket = null;
    this.drop();
  }

  onState(listener: (state: DesktopDriveState | null) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  state(): Promise<DesktopDriveState> {
    return this.send({ id: this.next++, request: { op: 'state' } });
  }

  run(command: DesktopDriveCommand): Promise<DesktopDriveState> {
    return this.send({ id: this.next++, request: { op: 'command', command } });
  }

  private send(request: DriveControlRequest): Promise<DesktopDriveState> {
    const { socket } = this;
    if (socket === null || socket.destroyed) {
      return Promise.reject(new DriveControlUnavailableError());
    }
    return new Promise<DesktopDriveState>((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject });
      socket.write(`${JSON.stringify(request)}\n`);
    });
  }

  private open(): void {
    const socket = connect(this.options.address);
    this.socket = socket;
    socket.on('error', () => undefined);
    socket.on('close', () => {
      if (this.socket === socket) this.socket = null;
      this.drop();
      this.retry();
    });
    const lines = createInterface({ input: socket });
    lines.on('error', () => undefined);
    lines.on('line', (line) => {
      this.receive(line);
    });
  }

  private receive(line: string): void {
    try {
      const frame = DRIVE_CONTROL_FRAME.parse(JSON.parse(line));
      if (frame.type === 'state') {
        this.publish(frame.state);
        return;
      }
      const waiting = this.pending.get(frame.id);
      this.pending.delete(frame.id);
      if (frame.result.ok) {
        this.publish(frame.result.state);
        waiting?.resolve(frame.result.state);
      } else {
        waiting?.reject(new DriveControlRefusedError(frame.result.message));
      }
    } catch (cause) {
      this.options.log.warn('drive_control.frame_rejected', { error: messageOf(cause) });
    }
  }

  private publish(state: DesktopDriveState): void {
    this.latest = state;
    for (const listener of this.listeners) listener(state);
  }

  private drop(): void {
    for (const waiting of this.pending.values()) waiting.reject(new DriveControlUnavailableError());
    this.pending.clear();
    if (this.latest === null) return;
    this.latest = null;
    for (const listener of this.listeners) listener(null);
  }

  private retry(): void {
    if (this.stopped || this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.stopped) this.open();
    }, this.options.retryMs);
    this.timer.unref();
  }
}
