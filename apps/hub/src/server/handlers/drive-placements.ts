import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { DrivePlacements } from '../../drive/placements';
import type { Store } from '../../store/store';
import { DONE_REPLY, bound, type Routes } from '../router';
import { refusing } from './drive-errors';
import { actorOf } from './drive-services';

type DrivePlacementRoute = 'listPlacements' | 'setPlacement' | 'removePlacement';

export type DrivePlacementRoutes = Routes<DrivePlacementRoute>;

export function drivePlacementRoutes(
  store: Store,
  placements: DrivePlacements,
): DrivePlacementRoutes {
  return {
    listPlacements: bound(E.listPlacements, ({ caller }) =>
      refusing(() => placements.list(actorOf(store, caller))),
    ),
    setPlacement: bound(E.setPlacement, ({ body, caller }) =>
      refusing(() => placements.set(actorOf(store, caller), body)),
    ),
    removePlacement: bound(E.removePlacement, ({ params, caller }) =>
      refusing(() => {
        placements.removeFor(actorOf(store, caller), params.placementId);
        return DONE_REPLY;
      }),
    ),
  };
}
