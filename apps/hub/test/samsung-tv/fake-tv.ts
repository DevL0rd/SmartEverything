import type { AddressInfo } from 'node:net';
import type { ProviderAdapter, StateUpdate, Unsubscribe } from '@smarteverything/domain';
import WebSocket, { WebSocketServer } from 'ws';
import { z } from 'zod';
import type { SamsungTvIo } from '../../src/adapters/samsung-tv/io';

export type PowerState = 'on' | 'standby' | 'off';

export type Greeting =
  'connect' | 'connect_without_token' | 'unauthorized' | 'time_out' | 'nothing';

export type ArtAnswers = 'normal' | 'error' | 'error_without_code' | 'without_value' | 'silent';

const ART_REQUEST = z.object({
  method: z.literal('ms.channel.emit'),
  params: z.object({
    event: z.literal('art_app_request'),
    to: z.literal('host'),
    data: z.string(),
  }),
});

const ART_DATA = z.object({
  request: z.string(),
  value: z.enum(['on', 'off']).optional(),
  id: z.string(),
  request_id: z.string(),
});

export type ArtRequest = z.infer<typeof ART_DATA>;

const ART_PATH = '/api/v2/channels/com.samsung.art-app';

export interface InstalledEntry {
  readonly appId: string;
  readonly app_type: number;
  readonly name: string;
}

function textOf(data: WebSocket.RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }
  return Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data).toString('utf8');
}

export class FakeTv {
  power: PowerState = 'on';
  greeting: Greeting = 'connect';
  issuedToken = 'token-1';
  wakesOnPacket = true;
  frameSupport: 'true' | 'false' | null = null;
  artMode = false;
  artGreeting: 'ready' | 'nothing' = 'ready';
  artAnswers: ArtAnswers = 'normal';
  readonly artRequests: ArtRequest[] = [];
  readonly sleeps: number[] = [];
  installed: readonly InstalledEntry[] = [{ appId: '111299001912', app_type: 2, name: 'YouTube' }];
  readonly connections: string[] = [];
  readonly messages: unknown[] = [];
  readonly packets: Uint8Array[] = [];
  private readonly sockets = new Set<WebSocket>();
  private readonly artSockets = new Set<WebSocket>();

  private constructor(private readonly server: WebSocketServer) {
    server.on('connection', (socket, request) => {
      const url = request.url ?? '';
      this.connections.push(url);
      if (url.startsWith(ART_PATH)) {
        this.artSockets.add(socket);
        socket.on('message', (data) => {
          this.receiveArt(socket, textOf(data));
        });
        this.greetArt(socket);
        return;
      }
      this.sockets.add(socket);
      socket.on('message', (data) => {
        this.receive(socket, textOf(data));
      });
      this.greet(socket);
    });
  }

  static async start(): Promise<FakeTv> {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise<void>((resolve) => {
      server.once('listening', resolve);
    });
    return new FakeTv(server);
  }

  get port(): number {
    const address: AddressInfo | string | null = this.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('the fake TV is not listening on a port');
    }
    return address.port;
  }

  get openSockets(): number {
    return [...this.sockets].filter((socket) => socket.readyState === WebSocket.OPEN).length;
  }

  get openArtSockets(): number {
    return [...this.artSockets].filter((socket) => socket.readyState === WebSocket.OPEN).length;
  }

  readonly io: SamsungTvIo = {
    fetch: (input) => this.answerRest(input instanceof Request ? input.url : input.toString()),
    sendMagicPacket: (packet) => {
      this.packets.push(packet);
      if (this.wakesOnPacket) {
        this.power = 'on';
      }
      return Promise.resolve();
    },
    openSocket: (url) => {
      const parsed = new URL(url);
      if (parsed.protocol !== 'wss:' || parsed.port !== '8002') {
        throw new Error(`unexpected remote URL ${url}`);
      }
      return new WebSocket(`ws://127.0.0.1:${String(this.port)}${parsed.pathname}${parsed.search}`);
    },
    clock: {
      now: () => new Date('2026-10-08T12:00:00.000Z'),
      at: () => () => undefined,
      sleep: (milliseconds) => {
        this.sleeps.push(milliseconds);
        return Promise.resolve();
      },
    },
  };

  dropConnections(): void {
    this.sockets.forEach((socket) => {
      socket.close();
    });
  }

  send(text: string): void {
    this.sockets.forEach((socket) => {
      socket.send(text);
    });
  }

  sendArt(data: Record<string, unknown> | string): void {
    const text = JSON.stringify({
      event: 'd2d_service_message',
      data: typeof data === 'string' ? data : JSON.stringify(data),
    });
    this.artSockets.forEach((socket) => {
      socket.send(text);
    });
  }

  async stop(): Promise<void> {
    [...this.sockets, ...this.artSockets].forEach((socket) => {
      socket.terminate();
    });
    await new Promise<void>((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }

  private answerRest(url: string): Promise<Response> {
    if (url !== 'http://tv.test:8001/api/v2/') {
      return Promise.reject(new Error(`unexpected REST URL ${url}`));
    }
    if (this.power === 'off') {
      return Promise.reject(new TypeError('fetch failed'));
    }
    const device = {
      PowerState: this.power,
      modelName: 'QE65S95C',
      name: 'Living room TV',
      ...(this.frameSupport === null ? {} : { FrameTVSupport: this.frameSupport }),
    };
    return Promise.resolve(Response.json({ type: 'Samsung SmartTV', device }));
  }

  private greet(socket: WebSocket): void {
    const events: Record<Greeting, unknown> = {
      connect: { event: 'ms.channel.connect', data: { token: this.issuedToken, clients: [] } },
      connect_without_token: { event: 'ms.channel.connect', data: { clients: [] } },
      unauthorized: { event: 'ms.channel.unauthorized' },
      time_out: { event: 'ms.channel.timeOut' },
      nothing: null,
    };
    const event = events[this.greeting];
    if (event !== null) {
      socket.send(JSON.stringify(event));
    }
  }

  private receive(socket: WebSocket, text: string): void {
    const message: unknown = JSON.parse(text);
    this.messages.push(message);
    if (text.includes('ed.installedApp.get')) {
      socket.send(JSON.stringify({ event: 'ed.installedApp.get', data: { data: this.installed } }));
    }
  }

  private greetArt(socket: WebSocket): void {
    if (this.artGreeting === 'nothing') {
      return;
    }
    socket.send(JSON.stringify({ event: 'ms.channel.connect', data: { token: this.issuedToken } }));
    socket.send(JSON.stringify({ event: 'ms.channel.ready', data: {} }));
  }

  private receiveArt(socket: WebSocket, text: string): void {
    const request = ART_DATA.parse(JSON.parse(ART_REQUEST.parse(JSON.parse(text)).params.data));
    this.artRequests.push(request);
    const { id } = request;
    const answers: Record<Exclude<ArtAnswers, 'normal'>, Record<string, unknown> | null> = {
      error: { event: 'error', error_code: '-7', request_data: '{}', id },
      error_without_code: { event: 'error', id },
      without_value: { event: 'artmode_status', id },
      silent: null,
    };
    const answer =
      this.artAnswers === 'normal' ? this.answerArt(request) : answers[this.artAnswers];
    if (answer !== null) {
      socket.send(JSON.stringify({ event: 'd2d_service_message', data: JSON.stringify(answer) }));
    }
  }

  private answerArt(request: ArtRequest): Record<string, unknown> {
    if (request.value !== undefined) {
      this.artMode = request.value === 'on';
      this.sendArt({ event: 'art_mode_changed', status: request.value });
      return { event: 'set_artmode_status', id: request.id, request_id: request.id };
    }
    return { event: 'artmode_status', value: this.artMode ? 'on' : 'off', id: request.id };
  }
}

export async function until(condition: () => boolean, withinMs = 3000): Promise<void> {
  const deadline = performance.now() + withinMs;
  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error('the condition never became true');
    }
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

export async function subscribe(
  adapter: ProviderAdapter,
): Promise<{ states: StateUpdate[]; stop: Unsubscribe }> {
  const states: StateUpdate[] = [];
  const stop = await adapter.subscribe({
    state: (update) => states.push(update),
    event: () => undefined,
    devices: () => undefined,
    failure: () => undefined,
  });
  return { states, stop };
}
