import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  API_ENDPOINTS as E,
  ApiError,
  PLANNER_FEED_PATHS,
  PLANNER_ICS_CONTENT_TYPE,
  PLANNER_PUBLISHED_FEED_FILE,
  type EndpointShape,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { z } from 'zod';
import { exportCollectionText, exportItemText } from '../planner/ical/export';
import { importIcs } from '../planner/ical/import';
import { IcalParseError } from '../planner/ical/model';
import { collectionOf } from '../planner/feeds/access';
import type { Store } from '../store/store';
import type { BuildOptions } from './build';
import type { ServerContext } from './context';
import { authenticate, type Caller } from './auth';
import { invalid } from './errors';
import { BODY_LIMIT, readBody, sendJson } from './http';
import type { RawRoute } from './http-server';
import { assertOwnerRoute } from './owner-route';
import { assertScopeRoute } from './person-scope';
import { plannerProfileOf } from './handlers/planner-items';

export interface PlannerIcalServices {
  readonly store: Store;
  readonly now: () => Date;
  readonly log: Logger;
}

const FILE_TYPE = `${PLANNER_ICS_CONTENT_TYPE}; charset=utf-8`;

function authorize(
  services: PlannerIcalServices,
  request: IncomingMessage,
  endpoint: EndpointShape,
  params: Readonly<Record<string, string>>,
): Caller {
  const caller = authenticate(services.store, request, endpoint.access, false);
  assertOwnerRoute(services.store, caller, endpoint);
  assertScopeRoute(services.store, caller, endpoint, params);
  return caller;
}

function queryOf<S extends z.ZodType>(request: IncomingMessage, schema: S): z.output<S> {
  const url = new URL(request.url ?? '/', 'http://server');
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw invalid('query', parsed.error);
  return parsed.data;
}

function fileName(name: string): string {
  const safe = name.replace(/[^\p{L}\p{N} _.-]+/gu, '').trim();
  return `${safe === '' ? 'calendar' : safe}.ics`;
}

function sendCalendar(response: ServerResponse, text: string, name: string): void {
  const bytes = Buffer.from(text, 'utf8');
  response.writeHead(200, {
    'content-type': FILE_TYPE,
    'content-length': bytes.byteLength,
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName(name))}`,
    'cache-control': 'no-store',
  });
  response.end(bytes);
}

function sendPublished(request: IncomingMessage, response: ServerResponse, text: string): void {
  const bytes = Buffer.from(text, 'utf8');
  const tag = `"${createHash('sha256').update(bytes).digest('hex')}"`;
  const headers = { etag: tag, 'cache-control': 'private, no-cache', 'content-type': FILE_TYPE };
  if (request.headers['if-none-match'] === tag) {
    response.writeHead(304, headers);
    response.end();
    return;
  }
  response.writeHead(200, { ...headers, 'content-length': bytes.byteLength });
  response.end(bytes);
}

async function importCalendar(
  services: PlannerIcalServices,
  request: IncomingMessage,
  response: ServerResponse,
  params: Readonly<Record<string, string>>,
): Promise<void> {
  const caller = authorize(services, request, E.importPlannerCalendar, params);
  const query = queryOf(request, E.importPlannerCalendar.query);
  const { store } = services;
  const type = (request.headers['content-type'] ?? '').toLowerCase();
  if (!type.startsWith(PLANNER_ICS_CONTENT_TYPE)) {
    throw new ApiError('unsupported_media_type', `Send the file as ${PLANNER_ICS_CONTENT_TYPE}.`);
  }
  const profileId = plannerProfileOf({ store }, caller, query.personId);
  const collection = collectionOf(store, profileId, params['collectionId'] ?? '', 'edit');
  if (collection.source === 'feed') {
    throw new ApiError('invalid_request', 'A subscribed calendar cannot be imported into.');
  }
  const text = (await readBody(request, BODY_LIMIT)).toString('utf8');
  try {
    const result = importIcs(store, services.now, {
      profileId: collection.profile_id,
      collectionId: collection.id,
      text,
      defaultZone: store.settings.read().time_zone,
    });
    services.log.info('planner.ics_imported', {
      collection: collection.id,
      added: result.added,
      updated: result.updated,
      unchanged: result.unchanged,
      unsupported: result.unsupported.length,
    });
    sendJson(response, 200, E.importPlannerCalendar.response.parse(result));
  } catch (cause) {
    if (cause instanceof IcalParseError) throw new ApiError('invalid_request', cause.message);
    throw cause;
  }
}

function exportCalendar(
  services: PlannerIcalServices,
  request: IncomingMessage,
  response: ServerResponse,
  params: Readonly<Record<string, string>>,
): void {
  const caller = authorize(services, request, E.exportPlannerCalendar, params);
  const query = queryOf(request, E.exportPlannerCalendar.query);
  const { store } = services;
  const profileId = plannerProfileOf({ store }, caller, query.personId);
  const collection = collectionOf(store, profileId, params['collectionId'] ?? '', 'view');
  sendCalendar(response, exportCollectionText(store, collection, services.now()), collection.name);
}

function exportItem(
  services: PlannerIcalServices,
  request: IncomingMessage,
  response: ServerResponse,
  params: Readonly<Record<string, string>>,
): void {
  const caller = authorize(services, request, E.exportPlannerItem, params);
  const query = queryOf(request, E.exportPlannerItem.query);
  const { store } = services;
  const profileId = plannerProfileOf({ store }, caller, query.personId);
  const item = store.plannerItems.byId(params['itemId'] ?? '', profileId);
  sendCalendar(response, exportItemText(store, item, services.now()), item.title);
}

function publishedFeed(
  services: PlannerIcalServices,
  request: IncomingMessage,
  response: ServerResponse,
  params: Readonly<Record<string, string>>,
): void {
  const file = PLANNER_PUBLISHED_FEED_FILE.safeParse(params['file']);
  const { store } = services;
  const link = file.success ? store.plannerExportLinks.byToken(file.data.slice(0, -4)) : undefined;
  if (link === undefined)
    throw new ApiError('not_found', 'This calendar link is no longer available.');
  const collection = store.plannerCollections.anyById(link.collection_id);
  sendPublished(request, response, exportCollectionText(store, collection, services.now(), false));
}

type Handler = (
  services: PlannerIcalServices,
  request: IncomingMessage,
  response: ServerResponse,
  params: Readonly<Record<string, string>>,
) => Promise<void> | void;

const bound =
  (services: PlannerIcalServices, handler: Handler): RawRoute['handle'] =>
  async (request, response, params) => {
    await handler(services, request, response, params);
  };

export function plannerIcalRoutes(services: PlannerIcalServices): readonly RawRoute[] {
  return [
    {
      method: E.importPlannerCalendar.method,
      path: E.importPlannerCalendar.path,
      handle: bound(services, importCalendar),
    },
    {
      method: E.exportPlannerCalendar.method,
      path: E.exportPlannerCalendar.path,
      handle: bound(services, exportCalendar),
    },
    {
      method: E.exportPlannerItem.method,
      path: E.exportPlannerItem.path,
      handle: bound(services, exportItem),
    },
    {
      method: 'GET',
      path: PLANNER_FEED_PATHS.publishedFeed,
      handle: bound(services, publishedFeed),
    },
  ];
}

export const plannerIcalRoutesOf = (
  options: Pick<BuildOptions, 'clock' | 'log'>,
  context: Pick<ServerContext, 'store'>,
): readonly RawRoute[] =>
  plannerIcalRoutes({
    store: context.store,
    now: options.clock.now,
    log: options.log.forArea('hub.planner'),
  });
