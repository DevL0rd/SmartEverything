import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  LineBasicMaterial,
  LineDashedMaterial,
  LineLoop,
  SphereGeometry,
  Vector3,
  type MeshBasicMaterial,
  type Object3D,
} from 'three';
import type { RenderPoint, RenderPose } from '../render-scene';
import { addSide, createCollector, groundPosition } from './mesh';
import {
  BADGE_M,
  DASH,
  DOCK_M,
  GLOW_M,
  OVERLAY_LIFT_M,
  OVERLAY_OPACITY,
  RAD,
  ROBOT_M,
  SEGMENTS,
  TRACK_LOOK_M,
  basic,
  disc,
  dot,
  flat,
  geometryOf,
  mesh,
  placementAt,
  roomPolygons,
  type Context,
  type LiveCamera,
  type LiveOverlay,
  type OverlayLook,
  type Spot,
} from './overlay-kit';
import { meshesForLayers } from './render-core-layers';
import { buildLiveTrail } from './vacuum-geometry';
import { TRAIL_HEIGHT_METRES } from './vacuum-trail';

function presence({ update: { floor, model }, look, y }: Context): readonly Object3D[] {
  const lift = y + OVERLAY_LIFT_M;
  const zones = model.zones.flatMap((zone) =>
    flat(
      `zone:${zone.id}`,
      zone.polygons,
      lift,
      zone.occupied
        ? basic(look.occupied, OVERLAY_OPACITY.zone)
        : basic(look.accent, OVERLAY_OPACITY.zoneClear),
    ),
  );
  const rooms = model.activeRooms.flatMap((roomId) =>
    flat(
      `active:${roomId}`,
      roomPolygons(floor, roomId),
      lift,
      basic(look.accent, OVERLAY_OPACITY.activeRoom),
    ),
  );
  const motion = model.motionDevices.flatMap((deviceId) => {
    const placement = placementAt(floor, deviceId);
    const material = basic(look.warning, OVERLAY_OPACITY.glow);
    return placement === null
      ? []
      : [
          disc(
            { name: `motion:${deviceId}`, at: placement.at, y: y + OVERLAY_LIFT_M * 4 },
            GLOW_M,
            material,
          ),
        ];
  });
  return [...zones, ...rooms, ...motion];
}

function heat({ update, look, y }: Context): readonly Object3D[] {
  return update.model.climate.flatMap((chip) => {
    if (chip.heat === null) return [];
    const colour = `#${new Color(look.cold).lerp(new Color(look.warm), chip.heat).getHexString()}`;
    const polygons = roomPolygons(update.floor, chip.roomId);
    return flat(
      `heat:${chip.roomId}`,
      polygons,
      y + OVERLAY_LIFT_M / 2,
      basic(colour, OVERLAY_OPACITY.heat),
    );
  });
}

function tracks({ update, look, y }: Context): readonly Object3D[] {
  const lift = y + OVERLAY_LIFT_M * 3;
  return update.model.tracks.flatMap((track) => {
    const trail = track.trail.map((point, index) =>
      disc(
        { name: `track-trail:${track.id}:${String(index)}`, at: point, y: lift },
        TRACK_LOOK_M.dot,
        basic(look.track, point.opacity * OVERLAY_OPACITY.trail),
      ),
    );
    const halo = basic(look.track, OVERLAY_OPACITY.halo);
    return [
      ...trail,
      disc({ name: `track-halo:${track.id}`, at: track.head, y: lift }, TRACK_LOOK_M.halo, halo),
      disc(
        { name: `track:${track.id}`, at: track.head, y: lift + OVERLAY_LIFT_M },
        TRACK_LOOK_M.head,
        basic(look.track, 1),
      ),
    ];
  });
}

function outline(
  { name, y }: Omit<Spot, 'at'>,
  ring: readonly RenderPoint[],
  look: OverlayLook,
  draw: LiveCamera,
): LineLoop {
  const points = ring.map((point) => new Vector3(...groundPosition(point, y)));
  const geometry = new BufferGeometry().setFromPoints(points);
  const style = {
    color: look.accent,
    transparent: true,
    opacity: draw.faint ? OVERLAY_OPACITY.faint : 1,
  };
  const material = draw.dashed
    ? new LineDashedMaterial({ ...style, ...DASH })
    : new LineBasicMaterial(style);
  const line = new LineLoop(geometry, material);
  line.name = name;
  if (draw.dashed) line.computeLineDistances();
  return line;
}

function frustum(draw: LiveCamera, look: OverlayLook, y: number): readonly Object3D[] {
  const { ring, floorM, topM } = draw.view.frustum;
  const scale = draw.faint ? OVERLAY_OPACITY.faint : 1;
  const base = y + floorM + OVERLAY_LIFT_M;
  const floorFill = basic(look.accent, OVERLAY_OPACITY.frustumFloor * scale);
  const fan = flat(`frustum-floor:${draw.deviceId}`, [{ outer: ring, holes: [] }], base, floorFill);
  const edge = outline({ name: `frustum-edge:${draw.deviceId}`, y: base }, ring, look, draw);
  if (topM <= floorM) return [...fan, edge];
  const sides = createCollector();
  ring.forEach((from, index) => {
    const to = ring[(index + 1) % ring.length] ?? from;
    addSide(sides, [from, to], { base, height: topM - floorM, colour: [1, 1, 1] });
  });
  return [
    ...fan,
    mesh(
      `frustum-sides:${draw.deviceId}`,
      geometryOf(sides),
      basic(look.accent, OVERLAY_OPACITY.frustumSide * scale),
    ),
    edge,
    outline({ name: `frustum-top:${draw.deviceId}`, y: y + topM }, ring, look, draw),
  ];
}

const cameras = ({ update, look, y }: Context): readonly Object3D[] =>
  update.model.cameras.flatMap((draw) => frustum(draw, look, y));

function robot(pose: RenderPose, y: number, look: OverlayLook): Group {
  const group = new Group();
  group.name = 'robot';
  const shape = new CylinderGeometry(
    ROBOT_M.radius,
    ROBOT_M.radius,
    ROBOT_M.height,
    SEGMENTS.circle,
  );
  const body = mesh('robot-body', shape, basic(look.robot, 1), 4);
  body.position.y = ROBOT_M.height / 2;
  const nose = mesh(
    'robot-heading',
    new SphereGeometry(ROBOT_M.nose, 12, 8),
    basic(look.accent, 1),
    4,
  );
  nose.position.set(ROBOT_M.radius - ROBOT_M.nose, ROBOT_M.height, 0);
  group.add(body, nose);
  group.position.set(...groundPosition(pose, y));
  group.rotation.y = pose.yawDeg * RAD;
  return group;
}

function vacuum({ update, look, y }: Context): readonly Object3D[] {
  const draw = update.model.vacuum;
  if (draw === null) return [];
  const trail = meshesForLayers(
    buildLiveTrail(
      draw.trail.map((run) => ({ mopping: run.mopping, points: [...run.points] })),
      update.theme,
    ),
  );
  for (const ribbon of trail) ribbon.position.y = y + OVERLAY_LIFT_M - TRAIL_HEIGHT_METRES / 2;
  const robots = draw.robot === null ? [] : [robot(draw.robot, y, look)];
  if (draw.dock === null) return [...trail, ...robots];
  const box = new BoxGeometry(DOCK_M.depth, DOCK_M.height, DOCK_M.width);
  const dock = mesh('dock', box, basic(look.dock, 1), 4);
  dock.position.set(...groundPosition(draw.dock, y + DOCK_M.height / 2));
  dock.rotation.y = draw.dock.yawDeg * RAD;
  return [...trail, ...robots, dock];
}

function alerts({ update: { floor, model }, look, y, pulse }: Context): readonly Object3D[] {
  return model.alerts.flatMap((alert) => {
    const tone = (opacity: number): MeshBasicMaterial => {
      const material = basic(look.critical, opacity);
      return alert.pulse ? pulse(material) : material;
    };
    const polygons = roomPolygons(floor, alert.roomId);
    const room = flat(
      `alert:${alert.deviceId}`,
      polygons,
      y + OVERLAY_LIFT_M * 2,
      tone(OVERLAY_OPACITY.alert),
    );
    const placement = placementAt(floor, alert.deviceId);
    if (placement === null) return room;
    const lift = y + OVERLAY_LIFT_M * 4;
    return [
      ...room,
      disc(
        { name: `alert-glow:${alert.deviceId}`, at: placement.at, y: lift },
        GLOW_M,
        tone(OVERLAY_OPACITY.glow),
      ),
    ];
  });
}

function badges({ update: { floor, model }, look, y }: Context): readonly Object3D[] {
  return model.badges.flatMap(({ deviceId, offline, lowBattery }) => {
    const placement = placementAt(floor, deviceId);
    if (placement === null) return [];
    const top = y + placement.height + BADGE_M.lift;
    const shifted = { x: placement.at.x + (offline ? BADGE_M.spacing : 0), y: placement.at.y };
    return [
      ...(offline
        ? [dot({ name: `offline:${deviceId}`, at: placement.at, y: top }, look.muted)]
        : []),
      ...(lowBattery
        ? [dot({ name: `battery:${deviceId}`, at: shifted, y: top }, look.warning)]
        : []),
    ];
  });
}

export interface Part {
  readonly name: string;
  readonly key: (model: LiveOverlay) => unknown;
  readonly build: (context: Context) => readonly Object3D[];
}

export const OVERLAY_PARTS: readonly Part[] = [
  {
    name: 'heat',
    key: (model) => model.climate.map((chip) => [chip.roomId, chip.heat]),
    build: heat,
  },
  {
    name: 'presence',
    key: (model) => [model.zones, model.activeRooms, model.motionDevices],
    build: presence,
  },
  { name: 'tracks', key: (model) => model.tracks, build: tracks },
  { name: 'cameras', key: (model) => model.cameras, build: cameras },
  { name: 'vacuum', key: (model) => model.vacuum, build: vacuum },
  { name: 'alerts', key: (model) => model.alerts, build: alerts },
  { name: 'badges', key: (model) => model.badges, build: badges },
];
