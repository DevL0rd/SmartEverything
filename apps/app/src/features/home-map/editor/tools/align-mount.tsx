import { useState, type ReactNode } from 'react';
import {
  homeMapPointInPolygon,
  type HomeMap,
  type HomeMapId,
  type HomeMapVec,
} from '@smarteverything/domain';
import {
  NO_EDIT_OVERLAY,
  type EditEvent,
  type EditGhost,
  type EditOverlay,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';
import { sourceToHouse } from '../../../../components/house-map/overlays/model';
import type { OverlayTransform } from '../../../../components/house-map/overlays/model-types';
import type { RenderBounds } from '../../../../components/house-map/render-scene';
import { selectionTick } from '../../../../platform/haptics';
import { useDevices } from '../../../../store/selectors';
import { pairGhosts } from './scan-align-model';
import {
  EMPTY_ALIGN,
  VacuumAlignPanel,
  alignPrompt,
  alignTap,
  alignTarget,
  chosenRobot,
  ringsBounds,
  robotRings,
  useRobotScene,
  vacuumRobots,
  type AlignDraft,
  type Ring,
  type VacuumAlign,
} from './vacuum-align';
import {
  NO_EDIT_FIELDS,
  type EditorNotice,
  type MountArgs,
  type MountEditFields,
} from '../mount-edit';

export interface AlignInput {
  readonly map: HomeMap;
  readonly mapId: HomeMapId | undefined;
  readonly floorId: string | null;
  readonly readOnly: boolean;
}

export interface AlignMount extends MountEditFields {
  readonly panel: ReactNode;
}

export type MountAlign = (args: MountArgs) => AlignMount;

const RAD = Math.PI / 180;

const centreOf = (bounds: RenderBounds | null): HomeMapVec =>
  bounds === null
    ? { x: 0, y: 0 }
    : { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };

export function ghostTransform(
  align: Pick<VacuumAlign, 'source' | 'robot'>,
  floor: RenderBounds | null,
): OverlayTransform {
  if (align.source !== null) {
    const { rotationDeg, tx, ty, mirrored } = align.source.transform;
    return { rotationDeg, tx, ty, mirrored };
  }
  const robot = centreOf(ringsBounds(align.robot));
  const house = centreOf(floor);
  return { rotationDeg: 0, tx: house.x - robot.x, ty: house.y - robot.y, mirrored: false };
}

export function houseToRobot(transform: OverlayTransform, point: HomeMapVec): HomeMapVec {
  const cos = Math.cos(transform.rotationDeg * RAD);
  const sin = Math.sin(transform.rotationDeg * RAD);
  const dx = point.x - transform.tx;
  const dy = point.y - transform.ty;
  const x = cos * dx + sin * dy;
  return { x: transform.mirrored ? -x : x, y: -sin * dx + cos * dy };
}

export function onRobotMap(robot: readonly Ring[], point: HomeMapVec): boolean {
  return robot.some((ring) => homeMapPointInPolygon({ outer: ring, holes: [] }, point));
}

function robotGhost(ring: Ring, transform: OverlayTransform): EditGhost {
  const points = ring.map((point) => ({ ...sourceToHouse(transform, point), height: 0 }));
  return { shape: 'polygon', points, tone: 'info' };
}

export function alignOverlay(
  align: Pick<VacuumAlign, 'robot' | 'draft' | 'readOnly'>,
  transform: OverlayTransform,
): EditOverlay | null {
  if (align.robot.length === 0) return null;
  const pairs = align.draft.map((pair) => ({
    from: pair.source === null ? null : sourceToHouse(transform, pair.source),
    to: pair.house,
  }));
  return {
    ...NO_EDIT_OVERLAY,
    mode: 'none',
    readOnly: align.readOnly,
    ghosts: [
      ...align.robot.map((ring) => robotGhost(ring, transform)),
      ...pairGhosts(pairs, 'info'),
    ],
  };
}

export function alignEdit(align: VacuumAlign, transform: OverlayTransform, event: EditEvent): void {
  if (event.type !== 'tap' || align.readOnly || align.source === null) return;
  const target = alignTarget(align.draft);
  if (target === null) return;
  const robot = houseToRobot(transform, event.point);
  if (target.side === 'source' && !onRobotMap(align.robot, robot)) return;
  selectionTick();
  const at = target.side === 'source' ? robot : event.point;
  align.setDraft(alignTap(align.draft, target.side, at));
}

export function alignNotice(align: VacuumAlign): EditorNotice | null {
  if (align.readOnly || align.source === null || align.robot.length === 0) return null;
  return { text: alignPrompt(align.draft), tone: 'info' };
}

function useVacuumAlign(input: AlignInput): VacuumAlign {
  const robots = vacuumRobots(useDevices());
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState<AlignDraft>(EMPTY_ALIGN);
  const deviceId = chosenRobot(picked, input.map, robots);
  const scene = useRobotScene(deviceId);
  return {
    ...{ map: input.map, mapId: input.mapId, floorId: input.floorId, readOnly: input.readOnly },
    robots,
    deviceId,
    choose: (next): void => {
      setPicked(next);
      setDraft(EMPTY_ALIGN);
    },
    source: input.map.sources.find((entry) => entry.deviceId === deviceId) ?? null,
    robot: scene === null ? [] : robotRings(scene),
    draft,
    setDraft,
  };
}

export function useAlignMount(input: AlignInput): MountAlign {
  const align = useVacuumAlign(input);
  return ({ floor }) => {
    const transform = ghostTransform(align, floor.bounds);
    const elsewhere = align.source !== null && align.source.floorId !== floor.id;
    return {
      ...NO_EDIT_FIELDS,
      overlay: elsewhere ? null : alignOverlay(align, transform),
      onEdit: (event): void => {
        alignEdit(align, transform, event);
      },
      notice: alignNotice(align),
      panel: <VacuumAlignPanel align={align} />,
    };
  };
}
