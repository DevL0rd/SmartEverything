import {
  API_ENDPOINTS as E,
  ApiError,
  apiErrorOf,
  buildPath,
  encodeQuery,
  type DesktopServer,
  type PlannerPhoneRingSet,
  type PlannerRingRow,
  type QueryValue,
} from '@smarteverything/domain';
import type { Agent } from 'node:http';
import type { z } from 'zod';
import type { DesktopRing } from './ring-types.js';

export interface RingHubLease {
  readonly url: URL;
  readonly agent?: Agent | undefined;
  readonly signal?: AbortSignal;
}

export interface RingHubRoute {
  readonly server: () => Promise<DesktopServer | null>;
  readonly lease: (server: DesktopServer, input: string) => RingHubLease;
}

export interface RingHubOptions {
  readonly server: () => Promise<DesktopServer | null>;
  readonly fetch: typeof fetch;
}

interface Endpoint<R> {
  readonly method: string;
  readonly path: string;
  readonly response: z.ZodType<R>;
}

interface Request {
  readonly params?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, QueryValue>>;
  readonly body?: unknown;
}

export class RingHubUnpairedError extends Error {
  constructor() {
    super('this desktop is not paired with a Hub');
    this.name = 'RingHubUnpairedError';
  }
}

export class RingNotFoundError extends Error {
  constructor(ring: DesktopRing) {
    super(`the Hub has no ring row for ${ring.ringKey} due ${ring.dueAt}`);
    this.name = 'RingNotFoundError';
  }
}

export interface RingSnooze {
  readonly until: string;
}

export class RingHub {
  readonly #options: RingHubOptions;
  #clientId: { readonly url: string; readonly id: string } | null = null;

  constructor(options: RingHubOptions) {
    this.#options = options;
  }

  async clientId(): Promise<string> {
    const server = await this.#paired();
    if (this.#clientId?.url === server.url) return this.#clientId.id;
    const session = await this.#call(server, E.session, {});
    this.#clientId = { url: server.url, id: session.client.id };
    return session.client.id;
  }

  async readSet(): Promise<{ readonly clientId: string; readonly set: PlannerPhoneRingSet }> {
    const clientId = await this.clientId();
    const set = await this.#send(E.readPlannerPhoneRings, { query: { clientId } });
    return { clientId, set };
  }

  async acknowledge(clientId: string, hash: string): Promise<boolean> {
    try {
      await this.#send(E.ackPlannerPhoneRings, { body: { clientId, hash } });
      return true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'conflict') return false;
      throw cause;
    }
  }

  async dismiss(ring: DesktopRing, dueAt: string): Promise<void> {
    if (ring.kind === 'timer') {
      await this.#send(E.cancelPlannerTimer, { params: { timerId: ring.refId } });
      return;
    }
    const row = await this.#rowOf(ring, dueAt);
    await this.#send(E.dismissPlannerAlarm, {
      params: { alarmId: ring.refId },
      body: { ringId: row.id },
    });
  }

  async snooze(ring: DesktopRing, dueAt: string): Promise<RingSnooze> {
    const row = await this.#rowOf(ring, dueAt);
    const snoozed = await this.#send(E.snoozePlannerAlarm, {
      params: { alarmId: ring.refId },
      body: { ringId: row.id },
    });
    if (snoozed.rang_at === null) throw new RingNotFoundError(ring);
    return { until: snoozed.rang_at };
  }

  async #rowOf(ring: DesktopRing, dueAt: string): Promise<PlannerRingRow> {
    const from = new Date(dueAt);
    const rows = await this.#send(E.listPlannerRings, {
      query: { from: from.toISOString(), to: new Date(from.getTime() + 1).toISOString() },
    });
    const row = rows.find(
      (candidate) => candidate.kind === ring.kind && candidate.ref_id === ring.refId,
    );
    if (row === undefined) throw new RingNotFoundError(ring);
    return row;
  }

  async #paired(): Promise<DesktopServer> {
    const server = await this.#options.server();
    if (server === null) throw new RingHubUnpairedError();
    return server;
  }

  async #send<R>(endpoint: Endpoint<R>, request: Request): Promise<R> {
    return this.#call(await this.#paired(), endpoint, request);
  }

  async #call<R>(server: DesktopServer, endpoint: Endpoint<R>, request: Request): Promise<R> {
    const path = buildPath(endpoint.path, request.params ?? {});
    const url = new URL(`${path}${encodeQuery(request.query ?? {})}`, server.url);
    const headers: Record<string, string> = { authorization: `Bearer ${server.token}` };
    if (request.body !== undefined) headers['content-type'] = 'application/json';
    const response = await this.#options.fetch(url, {
      method: endpoint.method,
      headers,
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    });
    const body: unknown = await response.json();
    if (!response.ok) throw apiErrorOf(response.status, body);
    return endpoint.response.parse(body);
  }
}
