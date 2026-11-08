import { createHash } from 'node:crypto';
import { API_ENDPOINTS as E, HOME_MAP_MAP_ID, type HomeMapActor } from '@smarteverything/domain';
import { z } from 'zod';
import { compactHomeMap } from '../../home-map/compact-read';
import type { HomeMapDeviceSync } from '../../home-map/device-sync';
import type { RobotMapFeeds } from '../../home-map/feeds';
import type { Catalogue } from '../../home-map/home-map-hub';
import type { HomeMapSet } from '../../home-map/map-set';
import type { HomeMapService } from '../../home-map/service';
import type { HomeMapSourceImports } from '../../home-map/source-import';
import type { Store } from '../../store/store';
import { profileIdOf, type Caller } from '../auth';
import { bound, tagged } from '../router';

export interface HomeMapServices {
  readonly homeMap: {
    readonly service: Pick<HomeMapService, 'get' | 'edit' | 'undo' | 'redo' | 'revisions'>;
    readonly catalogue: Pick<Catalogue, 'nameOf'>;
    readonly set: Pick<HomeMapSet, 'list'>;
    readonly feeds: Pick<RobotMapFeeds, 'list'>;
    readonly imports: Pick<HomeMapSourceImports, 'importSource' | 'align' | 'resolveNotice'>;
    readonly devices: Pick<HomeMapDeviceSync, 'place'>;
  };
  readonly store: Store;
}

const ANSWER_VERSION = z.looseObject({
  id: HOME_MAP_MAP_ID,
  revision: z.int().nonnegative(),
  view: z.literal('compact').optional(),
  maps: z.unknown().optional(),
  feeds: z.unknown().optional(),
});

const digestOf = (maps: unknown, feeds: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify([maps, feeds]))
    .digest('hex')
    .slice(0, 12);

export function homeMapTag(response: unknown): string {
  const { id, revision, view, maps, feeds } = ANSWER_VERSION.parse(response);
  if (view === undefined) return `${id}-${String(revision)}`;
  const base = `${id}-${String(revision)}-${view}`;
  return maps === undefined && feeds === undefined ? base : `${base}-${digestOf(maps, feeds)}`;
}

export function homeMapActorOf(store: Store, caller: Caller): HomeMapActor {
  const profileId = profileIdOf(store, caller);
  const byAi =
    caller.kind === 'service' ||
    (caller.kind === 'client' && (caller.via === 'assistant' || caller.mcpOrigin !== undefined));
  return byAi ? `ai:${profileId}` : `profile:${profileId}`;
}

const mapRoutes = ({ homeMap, store }: HomeMapServices) =>
  ({
    getHomeMap: tagged(
      bound(E.getHomeMap, ({ query }) => {
        const map = homeMap.service.get(query.mapId);
        return query.view === 'compact'
          ? {
              ...compactHomeMap(map, (modelId) => homeMap.catalogue.nameOf(modelId)),
              id: map.id,
              maps: homeMap.set.list(),
              feeds: homeMap.feeds.list(),
            }
          : map;
      }),
      homeMapTag,
    ),
    editHomeMap: bound(E.editHomeMap, ({ body, query, caller }) =>
      homeMap.service.edit(body, homeMapActorOf(store, caller), query.mapId),
    ),
    undoHomeMap: bound(E.undoHomeMap, ({ query, caller }) =>
      homeMap.service.undo(homeMapActorOf(store, caller), query.mapId),
    ),
    redoHomeMap: bound(E.redoHomeMap, ({ query, caller }) =>
      homeMap.service.redo(homeMapActorOf(store, caller), query.mapId),
    ),
    listHomeMapRevisions: bound(E.listHomeMapRevisions, ({ query }) =>
      homeMap.service.revisions({
        ...(query.actor === undefined ? {} : { actor: query.actor }),
        ...(query.after === undefined ? {} : { after: query.after }),
        ...(query.mapId === undefined ? {} : { mapId: query.mapId }),
      }),
    ),
  }) as const;

const sourceRoutes = ({ homeMap, store }: HomeMapServices) =>
  ({
    importHomeMapSource: bound(E.importHomeMapSource, ({ body, query }) =>
      homeMap.imports.importSource(body, query.mapId),
    ),
    alignHomeMapSource: bound(E.alignHomeMapSource, ({ params, body, query, caller }) => {
      return {
        revision: homeMap.imports.align(
          params.sourceId,
          body,
          homeMapActorOf(store, caller),
          query.mapId,
        ),
      };
    }),
    resolveHomeMapNotice: bound(E.resolveHomeMapNotice, ({ params, body, query, caller }) => {
      return {
        revision: homeMap.imports.resolveNotice(
          params.noticeId,
          body.action,
          homeMapActorOf(store, caller),
          query.mapId,
        ),
      };
    }),
    placeHomeMapDevices: bound(E.placeHomeMapDevices, ({ body, query, caller }) =>
      homeMap.devices.place(body, homeMapActorOf(store, caller), query.mapId),
    ),
  }) as const;

export const homeMapRoutes = (services: HomeMapServices) =>
  ({ ...mapRoutes(services), ...sourceRoutes(services) }) as const;
