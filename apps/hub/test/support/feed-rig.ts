import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { PlannerCollectionRow } from '@smarteverything/domain';
import { SimulatedClock } from '../../src/clock/simulated';
import { FeedService } from '../../src/planner/feeds';
import { testLogger } from './logs';
import { testStore, type TestStore } from './store';
import { inProcessCalendars } from './ical';

export const START = '2026-11-14T12:00:00.000Z';

export const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, '..', 'fixtures', 'ical', name), 'utf8');

interface Reply {
  readonly status: number;
  readonly headers?: Record<string, string>;
  readonly body?: string | Buffer;
}

type Handler = (request: IncomingMessage) => Reply;

export class FeedServer {
  readonly seen: IncomingMessage['headers'][] = [];
  private readonly handlers = new Map<string, Handler>();
  private readonly server: Server;

  constructor() {
    this.server = createServer((request, response) => {
      this.seen.push(request.headers);
      this.answer(request, response);
    });
  }

  on(path: string, handler: Handler): void {
    this.handlers.set(path, handler);
  }

  serve(path: string, text: string, headers: Record<string, string> = {}): void {
    this.on(path, (request) => {
      const tag = headers['etag'];
      if (tag !== undefined && request.headers['if-none-match'] === tag) {
        return { status: 304, headers };
      }
      return { status: 200, headers: { 'content-type': 'text/calendar', ...headers }, body: text };
    });
  }

  async listen(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server.listen(0, '127.0.0.1', resolve);
    });
  }

  url(path: string): string {
    const address = this.server.address();
    if (address === null || typeof address === 'string') throw new Error('the server has no port');
    return `http://127.0.0.1:${String(address.port)}${path}`;
  }

  async close(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }

  private answer(request: IncomingMessage, response: ServerResponse): void {
    const handler = this.handlers.get(request.url ?? '');
    const reply = handler === undefined ? { status: 404 } : handler(request);
    response.writeHead(reply.status, reply.headers);
    response.end(reply.body);
  }
}

export class FeedRig {
  private constructor(
    readonly parts: {
      readonly test: TestStore;
      readonly clock: SimulatedClock;
      readonly server: FeedServer;
      readonly service: FeedService;
      readonly ownerId: string;
      readonly memberId: string;
    },
  ) {}

  get test(): TestStore {
    return this.parts.test;
  }

  get clock(): SimulatedClock {
    return this.parts.clock;
  }

  get server(): FeedServer {
    return this.parts.server;
  }

  get service(): FeedService {
    return this.parts.service;
  }

  get ownerId(): string {
    return this.parts.ownerId;
  }

  get memberId(): string {
    return this.parts.memberId;
  }

  static async start(): Promise<FeedRig> {
    const clock = new SimulatedClock(START);
    const test = await testStore(() => clock.now());
    test.store.settings.updateHome({ time_zone: 'Europe/Berlin' });
    const owner = test.store.profiles.list()[0];
    if (owner === undefined) throw new Error('the store has no owner');
    const memberId = test.store.profiles.create({ name: 'Ann' }).id;
    const server = new FeedServer();
    await server.listen();
    const service = new FeedService({
      store: test.store,
      clock,
      calendars: inProcessCalendars,
      log: testLogger('feeds'),
    });
    service.start();
    await service.settled();
    return new FeedRig({ test, clock, server, service, ownerId: owner.id, memberId });
  }

  async close(): Promise<void> {
    this.service.stop();
    await this.server.close();
    await this.test.close();
  }

  subscribe(profileId: string, path: string, refreshMinutes = 360): PlannerCollectionRow {
    return this.test.store.plannerCollections.insert({
      profile_id: profileId,
      kind: 'calendar',
      name: 'Feed',
      colour: 'personal',
      icon: 'calendar',
      position: 5,
      visible: true,
      default_reminders: [],
      audience: 'personal',
      source: 'feed',
      google: null,
      feed: {
        kind: 'ics',
        url: this.server.url(path),
        refresh_minutes: refreshMinutes,
        etag: null,
        last_modified: null,
        fetched_at: null,
        failure: null,
      },
    });
  }

  rowsOf(collection: PlannerCollectionRow): string[] {
    return this.test.store.plannerItems
      .inCollection(collection.id)
      .map((row) => row.title)
      .sort();
  }

  feedOf(collection: PlannerCollectionRow): NonNullable<PlannerCollectionRow['feed']> {
    const feed = this.test.store.plannerCollections.anyById(collection.id).feed;
    if (feed === null) throw new Error('the collection lost its feed');
    return feed;
  }
}

export const failureOf = (row: PlannerCollectionRow): string | null =>
  row.feed?.kind === 'ics' ? (row.feed.failure?.reason ?? null) : null;
