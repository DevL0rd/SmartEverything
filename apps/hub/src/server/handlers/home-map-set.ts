import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { RobotMapFeeds } from '../../home-map/feeds';
import type { HomeMapSet } from '../../home-map/map-set';
import type { HomeMapReset } from '../../home-map/reset';
import type { HomeMapVersions } from '../../home-map/versions';
import type { HomeMapPatch } from '../../store/repositories/home-maps';
import type { Store } from '../../store/store';
import { bound } from '../router';
import { homeMapActorOf } from './home-map';

export interface HomeMapSetServices {
  readonly homeMap: {
    readonly set: Pick<HomeMapSet, 'list' | 'create' | 'update' | 'remove'>;
    readonly versions: Pick<HomeMapVersions, 'list' | 'save' | 'restore'>;
    readonly reset: Pick<HomeMapReset, 'reset'>;
    readonly feeds: Pick<RobotMapFeeds, 'list' | 'setFeed'>;
  };
  readonly store: Store;
}

interface UpdateBody {
  readonly name?: string | undefined;
  readonly isDefault?: true | undefined;
  readonly position?: number | undefined;
}

const patchOf = (body: UpdateBody): HomeMapPatch => ({
  ...(body.name === undefined ? {} : { name: body.name }),
  ...(body.isDefault === undefined ? {} : { isDefault: body.isDefault }),
  ...(body.position === undefined ? {} : { position: body.position }),
});

export const homeMapSetRoutes = ({ homeMap }: HomeMapSetServices) =>
  ({
    listHomeMaps: bound(E.listHomeMaps, () => homeMap.set.list()),
    createHomeMap: bound(E.createHomeMap, ({ body, caller }) =>
      homeMap.set.create(body.name, homeMapActorOf(caller)),
    ),
    updateHomeMap: bound(E.updateHomeMap, ({ params, body, caller }) =>
      homeMap.set.update(params.mapId, patchOf(body), homeMapActorOf(caller)),
    ),
    deleteHomeMap: bound(E.deleteHomeMap, async ({ params }) => {
      await homeMap.set.remove(params.mapId);
      return { ok: true } as const;
    }),
    listHomeMapVersions: bound(E.listHomeMapVersions, ({ params }) =>
      homeMap.versions.list(params.mapId),
    ),
    saveHomeMapVersion: bound(E.saveHomeMapVersion, ({ params, body, caller }) =>
      homeMap.versions.save(params.mapId, body.name, homeMapActorOf(caller)),
    ),
    restoreHomeMapVersion: bound(E.restoreHomeMapVersion, async ({ params, caller }) => ({
      revision: (
        await homeMap.versions.restore(params.mapId, params.versionId, homeMapActorOf(caller))
      ).revision,
    })),
    resetHomeMapToSource: bound(E.resetHomeMapToSource, async ({ params, body, caller }) => ({
      revision: (await homeMap.reset.reset(params.mapId, homeMapActorOf(caller), body.sourceId))
        .revision,
    })),
    listRobotMapFeeds: bound(E.listRobotMapFeeds, () => homeMap.feeds.list()),
    setRobotMapFeed: bound(E.setRobotMapFeed, ({ params, body, caller }) =>
      homeMap.feeds.setFeed(params.deviceId, params.robotMapId, body, homeMapActorOf(caller)),
    ),
  }) as const;
