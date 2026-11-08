import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { HubRefusalError, HubTransportError } from './policy';
import { refuseLoopbackRequest } from './refusal';

export interface LoopbackEntry<Owner, Value> {
  readonly owner: Owner;
  readonly value: Value;
  readonly controller: AbortController;
  readonly removeAbort: () => void;
}
export interface LoopbackListenerOptions<Owner, Value> {
  readonly name: string;
  readonly event: 'guest.refused' | 'resource.refused';
  readonly idPattern: RegExp;
  readonly unknownMessage: string;
  readonly retiredMessage: string;
  readonly serve: (
    request: IncomingMessage,
    response: ServerResponse,
    id: string,
    entry: LoopbackEntry<Owner, Value>,
  ) => Promise<void>;
}
export class LoopbackListener<Owner, Value> {
  private server: Server | null = null;
  private authority = '';
  private readonly entries = new Map<string, LoopbackEntry<Owner, Value>>();
  constructor(private readonly options: LoopbackListenerOptions<Owner, Value>) {}
  get host(): string {
    return this.authority;
  }
  get origin(): string | undefined {
    return this.authority === '' ? undefined : `http://${this.authority}`;
  }
  get running(): boolean {
    return this.server !== null;
  }
  async start(): Promise<void> {
    if (this.server !== null)
      throw new HubTransportError(`${this.options.name} is already running`);
    const server = createServer((request, response): void => {
      void this.dispatch(request, response).catch((cause: unknown) => {
        refuseLoopbackRequest(response, cause, this.options.event);
      });
    });
    server.on('connect', (_request, socket): void => {
      socket.destroy();
    });
    server.on('upgrade', (_request, socket): void => {
      socket.destroy();
    });
    await new Promise<void>((resolve, reject): void => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', (): void => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
      server.close();
      throw new HubTransportError(`${this.options.name} has no loopback TCP address`);
    }
    this.authority = `127.0.0.1:${String(address.port)}`;
    this.server = server;
  }
  add(
    owner: Owner,
    value: Value,
    signal: AbortSignal | undefined,
    retire: (id: string) => void,
  ): string {
    const id = randomBytes(32).toString('hex');
    const onAbort = (): void => {
      retire(id);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    this.entries.set(id, {
      owner,
      value,
      controller: new AbortController(),
      removeAbort: (): void => {
        signal?.removeEventListener('abort', onAbort);
      },
    });
    return id;
  }
  get(id: string): LoopbackEntry<Owner, Value> | undefined {
    return this.entries.get(id);
  }
  replace(id: string, value: Value): void {
    const entry = this.entries.get(id);
    if (entry !== undefined) this.entries.set(id, { ...entry, value });
  }
  find(match: (entry: LoopbackEntry<Owner, Value>) => boolean): string | undefined {
    for (const [id, entry] of this.entries) if (match(entry)) return id;
    return undefined;
  }
  release(id: string): void {
    const entry = this.entries.get(id);
    if (entry === undefined) return;
    this.entries.delete(id);
    entry.removeAbort();
    entry.controller.abort(new HubTransportError(this.options.retiredMessage));
  }
  releaseWhere(match: (entry: LoopbackEntry<Owner, Value>) => boolean): void {
    for (const [id, entry] of this.entries) if (match(entry)) this.release(id);
  }
  close(): void {
    for (const id of [...this.entries.keys()]) this.release(id);
    this.server?.closeAllConnections();
    this.server?.close();
    this.server = null;
    this.authority = '';
  }
  private async dispatch(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.headers.host !== this.authority)
      throw new HubRefusalError('Request Host differs from the listener', 403);
    const id = this.options.idPattern.exec(request.url ?? '')?.[1];
    const entry = id === undefined ? undefined : this.entries.get(id);
    if (id === undefined || entry === undefined)
      throw new HubRefusalError(this.options.unknownMessage, 409);
    await this.options.serve(request, response, id, entry);
  }
}
