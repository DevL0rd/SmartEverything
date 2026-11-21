import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { DrivePlacements } from '../../drive/placements';
import { DONE_REPLY, bound, type Routes } from '../router';
import { refusing } from './drive-errors';
import { actorOf } from './drive-services';

type DrivePlacementRoute =
  'listPlacements' | 'setPlacement' | 'setComputerMount' | 'removePlacement';

export type DrivePlacementRoutes = Routes<DrivePlacementRoute>;

export function drivePlacementRoutes(placements: DrivePlacements): DrivePlacementRoutes {
  return {
    listPlacements: bound(E.listPlacements, ({ caller }) =>
      refusing(() => placements.list(actorOf(caller))),
    ),
    setPlacement: bound(E.setPlacement, ({ body, caller }) =>
      refusing(() => placements.set(actorOf(caller), body)),
    ),
    setComputerMount: bound(E.setComputerMount, ({ body, caller }) =>
      refusing(() => placements.setMount(actorOf(caller), body)),
    ),
    removePlacement: bound(E.removePlacement, ({ params, caller }) =>
      refusing(async () => {
        await placements.removeFor(actorOf(caller), params.placementId);
        return DONE_REPLY;
      }),
    ),
  };
}
