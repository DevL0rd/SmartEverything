import type { VacuumPoint } from '@smarteverything/domain';
import { sourceToHouse } from '../../../../../components/house-map/overlays/model';
import type { OverlayTransform } from '../../../../../components/house-map/overlays/model-types';
import type { RenderBounds } from '../../../../../components/house-map/render-scene';
import { NUDGE_METRES } from './zone-shapes';
import type { Direction } from './zone-geometry';

export interface ZoneView {
  readonly bounds: RenderBounds;
  readonly toView: (point: VacuumPoint) => VacuumPoint;
  readonly toRobot: (point: VacuumPoint) => VacuumPoint;
}

const RAD = Math.PI / 180;

const same = (point: VacuumPoint): VacuumPoint => point;

export function houseToSource(transform: OverlayTransform, point: VacuumPoint): VacuumPoint {
  const cos = Math.cos(transform.rotationDeg * RAD);
  const sin = Math.sin(transform.rotationDeg * RAD);
  const dx = point.x - transform.tx;
  const dy = point.y - transform.ty;
  const x = cos * dx + sin * dy;
  return { x: transform.mirrored ? -x : x, y: -sin * dx + cos * dy };
}

export function robotZoneView(bounds: RenderBounds): ZoneView {
  return { bounds, toView: same, toRobot: same };
}

export function houseZoneView(bounds: RenderBounds, transform: OverlayTransform): ZoneView {
  return {
    bounds,
    toView: (point) => sourceToHouse(transform, point),
    toRobot: (point) => houseToSource(transform, point),
  };
}

const SCREEN_STEP: Readonly<Record<Direction, VacuumPoint>> = {
  left: { x: -NUDGE_METRES, y: 0 },
  right: { x: NUDGE_METRES, y: 0 },
  up: { x: 0, y: NUDGE_METRES },
  down: { x: 0, y: -NUDGE_METRES },
};

export function nudgeStep(view: ZoneView, direction: Direction): VacuumPoint {
  const origin = view.toRobot({ x: 0, y: 0 });
  const moved = view.toRobot(SCREEN_STEP[direction]);
  return { x: moved.x - origin.x, y: moved.y - origin.y };
}
