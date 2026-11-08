import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  API_ENDPOINTS as E,
  ApiError,
  HOME_MAP_MAP_ID,
  HOME_MAP_SCAN_HASH,
  MEDIA_PATHS,
  type EndpointShape,
  type HomeMapActor,
  type HomeMapId,
  type HomeMapScan,
  type HomeMapScanStored,
  type LiveChange,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { ScanReach } from '../../home-map/scan-reach';
import type { ReceivedScan, ScanStore } from '../../home-map/scan-store';
import type { HomeMapService } from '../../home-map/service';
import type { Store } from '../../store/store';
import { authenticate, type Caller } from '../auth';
import type { BuildOptions } from '../build';
import type { ServerContext } from '../context';
import { invalid } from '../errors';
import { sendJson } from '../http';
import { LINK_LIFETIME_SECONDS, type MediaLinks } from '../media-links';
import type { RawRoute } from '../http-server';
import { assertOwnerRoute } from '../owner-route';
import { assertScopeRoute } from '../person-scope';
import { serveBytes } from '../file-serve';
import { homeMapActorOf } from './home-map';

export interface HomeMapScanServices {
  readonly authorize: (request: IncomingMessage, endpoint: EndpointShape) => Caller;
  readonly actorOf: (caller: Caller) => HomeMapActor;
  readonly scans: ScanStore;
  readonly reach: ScanReach;
  readonly maps: Pick<HomeMapService, 'get' | 'apply'>;
  readonly links: Pick<MediaLinks, 'homeMapScan' | 'verify'>;
  readonly now: () => string;
  readonly log: Logger;
}

export interface HomeMapScanOptions {
  readonly now: () => Date;
  readonly log: Logger;
}

const UPLOADED_TRANSFORM = {
  tx: 0,
  ty: 0,
  tz: 0,
  yawDeg: 0,
  scale: 1,
  levelled: false,
} as const;

const FILE_HEADERS = {
  'cache-control': `private, max-age=${String(LINK_LIFETIME_SECONDS)}, immutable`,
  'content-type': 'application/octet-stream',
} as const;

const LENGTH = /^[1-9]\d*$/;

function mapIdOf(params: Readonly<Record<string, string>>): HomeMapId {
  const parsed = HOME_MAP_MAP_ID.safeParse(params['mapId']);
  if (!parsed.success) throw invalid('path', parsed.error);
  return parsed.data;
}

function queryOf(request: IncomingMessage): Record<string, string> {
  return Object.fromEntries(new URL(request.url ?? '/', 'http://server').searchParams);
}

function declaredLength(request: IncomingMessage): number {
  const header = request.headers['content-length'];
  if (header === undefined || !LENGTH.test(header) || !Number.isSafeInteger(Number(header))) {
    throw new ApiError(
      'invalid_request',
      'Send the scan with a content-length header that gives its exact length in bytes.',
    );
  }
  return Number(header);
}

function scanOf(services: HomeMapScanServices, mapId: HomeMapId): HomeMapScan {
  const { scan } = services.maps.get(mapId);
  if (scan === undefined) throw new ApiError('not_found', 'This map has no scan.');
  return scan;
}

interface ScanFile {
  readonly hash: string;
  readonly format: HomeMapScan['file']['format'];
}

function currentFile(services: HomeMapScanServices, mapId: HomeMapId, hash: string): ScanFile {
  const scan = scanOf(services, mapId);
  if (scan.file.hash === hash) return scan.file;
  if (scan.lod?.hash === hash) return { hash, format: 'rad' };
  throw new ApiError('not_found', 'This scan file was replaced; ask for a new link.');
}

export function settleScans(
  services: Pick<HomeMapScanServices, 'scans' | 'reach' | 'maps'>,
  mapId: HomeMapId,
): void {
  const held = services.reach.reachable(mapId);
  if (held === null) return;
  services.scans.reconcile(mapId, services.maps.get(mapId).scan, held);
}

export function followScans(
  services: Pick<HomeMapScanServices, 'scans' | 'reach' | 'maps'>,
  change: LiveChange,
): void {
  if (change.table !== 'home_maps') return;
  const deleted = change.operation === 'DELETE';
  const mapId = HOME_MAP_MAP_ID.safeParse((deleted ? change.oldRecord : change.record)?.id);
  if (!mapId.success) return;
  if (!deleted) {
    settleScans(services, mapId.data);
    return;
  }
  services.reach.forget(mapId.data);
  services.scans.removeAll(mapId.data);
}

interface Publication {
  readonly mapId: HomeMapId;
  readonly received: ReceivedScan;
  readonly format: HomeMapScan['file']['format'];
  readonly name: string;
  readonly actor: HomeMapActor;
}

async function publish(
  services: HomeMapScanServices,
  { mapId, received, format, name, actor }: Publication,
): Promise<HomeMapScanStored> {
  const scan: HomeMapScan = {
    file: { hash: received.hash, format, bytes: received.bytes, name },
    lod: null,
    transform: UPLOADED_TRANSFORM,
    opacity: 1,
    points: [],
    residualM: null,
    uploadedAt: services.now(),
    uploadedBy: actor,
  };
  await services.scans.commit(received, mapId, format);
  try {
    const applied = services.maps.apply([{ op: 'setScan', scan }], actor, {}, mapId);
    const stored = applied.map.scan;
    if (applied.applied.length === 0 || stored === undefined) {
      throw new ApiError('conflict', 'The map did not accept the scan.');
    }
    return { revision: applied.revision, scan: stored };
  } finally {
    services.scans.release(mapId, { hash: received.hash, format });
    settleScans(services, mapId);
  }
}

async function upload(
  services: HomeMapScanServices,
  request: IncomingMessage,
  response: ServerResponse,
  params: Readonly<Record<string, string>>,
): Promise<void> {
  const caller = services.authorize(request, E.uploadHomeMapScan);
  const mapId = mapIdOf(params);
  const query = E.uploadHomeMapScan.query.safeParse(queryOf(request));
  if (!query.success) throw invalid('query', query.error);
  const declared = declaredLength(request);
  services.maps.get(mapId);
  const received = await services.scans.receive(request, { declared, format: query.data.format });
  try {
    const stored = await services.scans.exclusive(() =>
      publish(services, {
        mapId,
        received,
        format: query.data.format,
        name: query.data.name,
        actor: services.actorOf(caller),
      }),
    );
    services.log.info('home_map.scan_stored', {
      mapId,
      format: query.data.format,
      bytes: received.bytes,
      points: received.points,
    });
    sendJson(response, 200, E.uploadHomeMapScan.response.parse(stored));
  } catch (error) {
    services.scans.discard(received);
    throw error;
  }
}

function scanLink(
  services: HomeMapScanServices,
  request: IncomingMessage,
  response: ServerResponse,
  params: Readonly<Record<string, string>>,
): void {
  services.authorize(request, E.homeMapScanLink);
  const mapId = mapIdOf(params);
  const query = E.homeMapScanLink.query.safeParse(queryOf(request));
  if (!query.success) throw invalid('query', query.error);
  const file = currentFile(services, mapId, query.data.hash);
  sendJson(
    response,
    200,
    E.homeMapScanLink.response.parse(services.links.homeMapScan(mapId, file.hash)),
  );
}

async function serveFile(
  services: HomeMapScanServices,
  request: IncomingMessage,
  response: ServerResponse,
  params: Readonly<Record<string, string>>,
): Promise<void> {
  services.links.verify(new URL(request.url ?? '/', 'http://server'));
  const mapId = mapIdOf(params);
  const hash = HOME_MAP_SCAN_HASH.safeParse(params['hash']);
  if (!hash.success) throw invalid('path', hash.error);
  const file = currentFile(services, mapId, hash.data);
  const source = await services.scans.source(mapId, file);
  if (source === null) {
    services.log.error('home_map.scan_file_missing', { mapId, hash: file.hash });
    throw new ApiError('not_found', 'The scan file is missing on the hub; upload it again.');
  }
  await serveBytes(
    { size: source.size, etag: file.hash, headers: FILE_HEADERS, stream: source.stream },
    request,
    response,
  );
}

async function removeScan(
  services: HomeMapScanServices,
  request: IncomingMessage,
  response: ServerResponse,
  params: Readonly<Record<string, string>>,
): Promise<void> {
  const caller = services.authorize(request, E.removeHomeMapScan);
  const mapId = mapIdOf(params);
  scanOf(services, mapId);
  const revision = await services.scans.exclusive(() => {
    const applied = services.maps.apply(
      [{ op: 'removeScan' }],
      services.actorOf(caller),
      {},
      mapId,
    );
    if (applied.applied.length === 0)
      throw new ApiError('conflict', 'The scan was already removed.');
    return applied.revision;
  });
  services.log.info('home_map.scan_removed', { mapId });
  sendJson(response, 200, E.removeHomeMapScan.response.parse({ revision }));
}

export function homeMapScanRoutes(services: HomeMapScanServices): readonly RawRoute[] {
  return [
    {
      method: 'PUT',
      path: E.uploadHomeMapScan.path,
      handle: (request, response, params) => upload(services, request, response, params),
    },
    {
      method: 'GET',
      path: E.homeMapScanLink.path,
      handle: (request, response, params) =>
        new Promise<void>((resolve) => {
          scanLink(services, request, response, params);
          resolve();
        }),
    },
    {
      method: 'GET',
      path: MEDIA_PATHS.homeMapScan,
      handle: (request, response, params) => serveFile(services, request, response, params),
    },
    {
      method: 'DELETE',
      path: E.removeHomeMapScan.path,
      handle: (request, response, params) => removeScan(services, request, response, params),
    },
  ];
}

function authorizer(store: Store): HomeMapScanServices['authorize'] {
  return (request, endpoint) => {
    const caller = authenticate(store, request, endpoint.access, false);
    assertOwnerRoute(store, caller, endpoint);
    assertScopeRoute(store, caller, endpoint, {});
    return caller;
  };
}

export function homeMapScanServices(
  options: HomeMapScanOptions,
  context: Pick<ServerContext, 'homeMap' | 'store' | 'links'>,
): HomeMapScanServices {
  const { scans } = context.homeMap;
  scans.sweepTemp();
  const maps = context.homeMap.service;
  const services: HomeMapScanServices = {
    authorize: authorizer(context.store),
    actorOf: (caller) => homeMapActorOf(context.store, caller),
    scans,
    reach: new ScanReach((mapId, after) => maps.revisions({ mapId, after }), options.log),
    maps,
    links: context.links,
    now: () => options.now().toISOString(),
    log: options.log,
  };
  context.store.feed.subscribe((change) => {
    followScans(services, change);
  });
  return services;
}

export const homeMapScanRoutesOf = (
  options: Pick<BuildOptions, 'clock' | 'log'>,
  context: Pick<ServerContext, 'homeMap' | 'store' | 'links'>,
): readonly RawRoute[] =>
  homeMapScanRoutes(
    homeMapScanServices(
      {
        now: options.clock.now,
        log: options.log.forArea('hub.home-map-scan'),
      },
      context,
    ),
  );
