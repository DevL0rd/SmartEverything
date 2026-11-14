import type { DesktopDriveState, DesktopDriveCommand } from '@smarteverything/domain';
import { chmod, rm } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import { createInterface } from 'node:readline';
import { background, messageOf, type Logger } from '@smarteverything/logging';
import { DRIVE_CONTROL_REQUEST, type DriveControlFrame } from './control-protocol.js';

export interface DriveControlTarget {
  readonly state: () => Promise<DesktopDriveState>;
  readonly run: (command: DesktopDriveCommand) => Promise<void>;
  readonly onChange: (listener: () => void) => () => void;
}

export interface DriveControlServerOptions {
  readonly address: string;
  readonly platform: NodeJS.Platform;
  readonly target: DriveControlTarget;
  readonly log: Logger;
}

export class DriveControlServer {
  private readonly clients = new Set<Socket>();
  private server: Server | null = null;
  private stopChange: (() => void) | null = null;

  constructor(private readonly options: DriveControlServerOptions) {}

  async start(): Promise<void> {
    const { address, platform } = this.options;
    if (platform !== 'win32') await rm(address, { force: true });
    const server = createServer((socket) => {
      this.accept(socket);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(address, () => {
        server.off('error', reject);
        resolve();
      });
    });
    if (platform !== 'win32') await chmod(address, 0o600);
    server.on('error', (cause) => {
      this.options.log.error('drive_control.server_failed', cause);
    });
    this.server = server;
    this.stopChange = this.options.target.onChange(() => {
      this.broadcast();
    });
  }

  async stop(): Promise<void> {
    this.stopChange?.();
    this.stopChange = null;
    for (const client of this.clients) client.destroy();
    this.clients.clear();
    const { server } = this;
    this.server = null;
    if (server === null) return;
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
    if (this.options.platform !== 'win32') await rm(this.options.address, { force: true });
  }

  private accept(socket: Socket): void {
    this.clients.add(socket);
    socket.on('error', () => undefined);
    socket.on('close', () => {
      this.clients.delete(socket);
    });
    const lines = createInterface({ input: socket });
    lines.on('error', () => undefined);
    lines.on('line', (line) => {
      background(this.answer(socket, line), 'drive_control.answer_failed');
    });
    this.push(socket);
  }

  private async answer(socket: Socket, line: string): Promise<void> {
    let id = -1;
    try {
      const parsed = DRIVE_CONTROL_REQUEST.parse(JSON.parse(line));
      id = parsed.id;
      if (parsed.request.op === 'command') await this.options.target.run(parsed.request.command);
      const state = await this.options.target.state();
      this.write(socket, { type: 'reply', id, result: { ok: true, state } });
    } catch (cause) {
      this.options.log.warn('drive_control.request_failed', { error: messageOf(cause) });
      this.write(socket, {
        type: 'reply',
        id,
        result: { ok: false, message: messageOf(cause) || 'The request failed' },
      });
    }
  }

  private broadcast(): void {
    for (const client of this.clients) this.push(client);
  }

  private push(socket: Socket): void {
    this.options.target
      .state()
      .then((state) => {
        this.write(socket, { type: 'state', state });
      })
      .catch((cause: unknown) => {
        this.options.log.warn('drive_control.state_failed', { error: messageOf(cause) });
      });
  }

  private write(socket: Socket, frame: DriveControlFrame): void {
    if (!socket.destroyed) socket.write(`${JSON.stringify(frame)}\n`);
  }
}
