import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import type { PluginRecords, PluginSecrets } from '../../../src/plugins/builtin/contract';
import type { ShellyEnrollment } from '../../../src/plugins/builtin/shelly-presence/enrollment';

export const DEVICE_ID = 'shellypresencegen4-aabbcc';
export const DEVICE_INFO = {
  id: DEVICE_ID,
  mac: 'AABBCC',
  model: 'S4SN-0U61X',
  gen: 4,
  fw_id: '20260101-000000/1.0.0',
  ver: '1.0.0',
  app: 'presence',
  auth_en: false,
};

const CONFIG: Record<string, JsonValue> = {
  sys: { device: { name: 'Hall radar' } },
  presence: { enable: true, main_zone: 'presencezone:200' },
  'illuminance:0': { id: 0 },
};
const DYNAMIC_CONFIG: Record<string, JsonValue> = {
  'presencezone:200': { id: 200, enable: true, area: [[0, 0, 4, 4]] },
};
const COMPONENT_PAGE_SIZE = 2;

function status(): Record<string, JsonValue> {
  return {
    sys: { cfg_rev: 5 },
    presence: {},
    'presencezone:200': { id: 200, value: false, num_objects: 0 },
    'illuminance:0': { id: 0, lux: 5, illumination: 'dark' },
  };
}

const REQUEST = z.object({
  id: z.number(),
  src: z.string(),
  method: z.string(),
  params: JSON_VALUE,
});
type Request = z.output<typeof REQUEST>;

export type RpcHandler = (
  method: string,
  params: JsonValue,
) => JsonValue | { error: JsonValue } | undefined;

export type HttpHandler = (request: IncomingMessage, response: ServerResponse) => boolean;

export class FakeShelly {
  readonly calls: { readonly method: string; readonly params: JsonValue }[] = [];
  handler: RpcHandler | null = null;
  http: HttpHandler | null = null;
  info: Record<string, JsonValue> = DEVICE_INFO;
  methods: string[] = [
    'Shelly.GetConfig',
    'Shelly.GetComponents',
    'Presence.LiveTrack',
    'Presence.GetStatus',
  ];
  private readonly web: Server;
  private readonly server: WebSocketServer;
  private socket: WebSocket | null = null;

  private constructor(web: Server, server: WebSocketServer) {
    this.web = web;
    this.server = server;
    web.on('request', (request, response) => {
      if (this.http?.(request, response) === true) return;
      if (request.url === '/shelly') response.end(JSON.stringify(this.info));
      else response.writeHead(404).end();
    });
    server.on('connection', (socket) => {
      this.socket = socket;
      socket.on('message', (raw) => {
        this.reply(
          socket,
          REQUEST.parse(
            JSON.parse(new TextDecoder().decode(Array.isArray(raw) ? Buffer.concat(raw) : raw)),
          ),
        );
      });
    });
  }

  static async open(): Promise<FakeShelly> {
    const web = createServer();
    const server = new WebSocketServer({ server: web });
    await new Promise<void>((resolve) => {
      web.listen(0, '127.0.0.1', resolve);
    });
    return new FakeShelly(web, server);
  }

  get address(): string {
    const bound = this.web.address();
    if (bound === null || typeof bound === 'string')
      throw new Error('The fake Shelly is not listening.');
    return `http://127.0.0.1:${String(bound.port)}`;
  }

  notify(method: string, params: JsonValue): void {
    this.socket?.send(JSON.stringify({ src: DEVICE_ID, method, params }));
  }

  dropClients(): void {
    for (const client of this.server.clients) client.terminate();
  }

  async close(): Promise<void> {
    this.dropClients();
    await new Promise<void>((resolve) => {
      this.server.close(() => {
        this.web.close(() => {
          resolve();
        });
      });
    });
  }

  private reply(socket: WebSocket, request: Request): void {
    this.calls.push({ method: request.method, params: request.params });
    const custom = this.handler?.(request.method, request.params);
    const frame = { id: request.id, src: DEVICE_ID, dst: request.src };
    if (
      custom !== undefined &&
      typeof custom === 'object' &&
      custom !== null &&
      'error' in custom
    ) {
      socket.send(JSON.stringify({ ...frame, error: custom.error }));
      return;
    }
    socket.send(
      JSON.stringify({ ...frame, result: custom ?? this.answer(request.method, request.params) }),
    );
  }

  private answer(method: string, params: JsonValue): JsonValue {
    switch (method) {
      case 'Shelly.GetDeviceInfo':
        return DEVICE_INFO;
      case 'Shelly.ListMethods':
        return { methods: this.methods };
      case 'Shelly.GetConfig':
        return CONFIG;
      case 'Shelly.GetStatus':
        return status();
      case 'Shelly.GetComponents':
        return componentPage(params);
      default:
        return {};
    }
  }
}

function componentPage(params: JsonValue): JsonValue {
  const { offset } = z.object({ offset: z.int() }).parse(params);
  const current = status();
  const all = Object.entries({ ...CONFIG, ...DYNAMIC_CONFIG }).map(([key, config]) => ({
    key,
    config,
    ...(current[key] === undefined ? {} : { status: current[key] }),
  }));
  return {
    components: all.slice(offset, offset + COMPONENT_PAGE_SIZE),
    cfg_rev: 5,
    offset,
    total: all.length,
  };
}

export interface MemoryRecords extends PluginRecords {
  readonly puts: () => number;
}

export function memoryRecords(): MemoryRecords {
  const map = new Map<string, JsonValue>();
  let puts = 0;
  return {
    get: (key) => map.get(key) ?? null,
    list: () => [...map].map(([key, value]) => ({ key, value })),
    put: (key, value): void => {
      puts += 1;
      map.set(key, value);
    },
    remove: (key): void => {
      map.delete(key);
    },
    puts: () => puts,
  };
}

export interface MemorySecrets extends PluginSecrets {
  readonly names: () => string[];
}

export function memorySecrets(): MemorySecrets {
  const map = new Map<string, string>();
  return {
    get: (name) => map.get(name) ?? null,
    set: (name, value): Promise<void> => {
      map.set(name, value);
      return Promise.resolve();
    },
    remove: (name): Promise<void> => {
      map.delete(name);
      return Promise.resolve();
    },
    names: () => [...map.keys()],
  };
}

export function enrollmentAt(address: string): ShellyEnrollment {
  return {
    info: DEVICE_INFO,
    address,
    secret: null,
    generations: {},
    activeZones: [],
    tlsSecret: null,
  };
}

export async function until(condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
