import { readFileSync } from 'node:fs';
import { VACUUM_SCENE, type VacuumPose, type VacuumScene } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import type { MeshLayer, SceneGeometry } from './vacuum-geometry';
import { vacuumRenderScene } from '../adapters/vacuum-scene';
import { floorOf, placement } from '../lighting-fixture';
import type { RenderFloor, RenderScene } from '../render-scene';
import { Map3dBridge, floorSceneKey } from './map-3d-bridge';
import { createFailureReporter } from './map-3d-failures';
import type { Map3dHandle, ShownTrail } from './map-3d-protocol';
import { SCENE_MESSAGE } from './map-3d-protocol';
import { Map3dSession, type SceneRenderer } from './map-3d-session';
import { buildSceneGeometry } from './vacuum-geometry';

const scene: VacuumScene = VACUUM_SCENE.parse(
  JSON.parse(
    readFileSync(
      new URL(
        '../../../features/devices/vacuum/model/scene-geometry.fixture.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);

function vacuumOf(source: VacuumScene): { scene: RenderScene; floor: RenderFloor } {
  const rendered = vacuumRenderScene({ scene: source });
  const [floor] = rendered.floors;
  if (floor === undefined) throw new Error('no floor');
  return { scene: rendered, floor };
}

const robot = vacuumOf(scene);

const next = vacuumOf({ ...scene, index: scene.index + 1 });

const homeFloor: RenderFloor = {
  ...floorOf([placement('lamp', 2, 2)]),
  walls: [
    {
      id: 'wall-a',
      from: { x: 0, y: 0 },
      to: { x: 8, y: 0 },
      thickness: 0.1,
      height: 2.5,
      kind: 'solid',
      exterior: true,
    },
  ],
};

const home: RenderScene = {
  key: 'home:7',
  source: 'home_map',
  bounds: homeFloor.bounds,
  floors: [homeFloor],
  issues: [],
};

const robotKey = floorSceneKey(robot.scene, robot.floor);

const robotJson = JSON.stringify(robot.floor);

const POSE: VacuumPose = { x: 1.5, y: -0.25, yaw: 0.5 };

const MAX_POSE_MESSAGE_BYTES = 120;

function fakeHandle(): Map3dHandle & {
  readonly setScene: ReturnType<typeof vi.fn<Map3dHandle['setScene']>>;
  readonly setPose: ReturnType<typeof vi.fn<Map3dHandle['setPose']>>;
  readonly clearPose: ReturnType<typeof vi.fn<Map3dHandle['clearPose']>>;
  readonly setTrail: ReturnType<typeof vi.fn<Map3dHandle['setTrail']>>;
} {
  return {
    setScene: vi.fn(),
    setPose: vi.fn(),
    clearPose: vi.fn(),
    setTrail: vi.fn(),
    setModels: vi.fn(),
    setLive: vi.fn(),
    setScan: vi.fn(),
    clearScan: vi.fn(),
    setScanPlacement: vi.fn(),
    setScanBand: vi.fn(),
    clearScanBand: vi.fn(),
    setEditFloor: vi.fn(),
    setEdit: vi.fn(),
    editResult: vi.fn(),
    clearEdit: vi.fn(),
  };
}

function connected(): { bridge: Map3dBridge; handle: ReturnType<typeof fakeHandle> } {
  const handle = fakeHandle();
  const bridge = new Map3dBridge(() => handle);
  bridge.ready();
  return { bridge, handle };
}

describe('Map3dBridge scene', () => {
  it('sends nothing until the page reports ready', () => {
    const handle = fakeHandle();
    const bridge = new Map3dBridge(() => handle);
    bridge.setScene(robot.scene, robot.floor);
    bridge.setPose(POSE, 0);
    expect(handle.setScene).not.toHaveBeenCalled();
    expect(handle.setPose).not.toHaveBeenCalled();
    bridge.ready();
    expect(handle.setScene).toHaveBeenCalledTimes(1);
    expect(handle.setPose).toHaveBeenCalledTimes(1);
  });

  it('sends the scene once per version key however many poses follow', () => {
    const { bridge, handle } = connected();
    bridge.setScene(robot.scene, robot.floor);
    for (let step = 0; step < 50; step += 1) {
      bridge.setPose({ x: step, y: step, yaw: step / 10 }, 0);
      bridge.setScene(robot.scene, robot.floor);
    }
    expect(handle.setScene).toHaveBeenCalledTimes(1);
    expect(handle.setScene).toHaveBeenCalledWith(robotKey, 'vacuum', robotJson);
    expect(handle.setPose).toHaveBeenCalledTimes(50);
  });

  it('sends the scene again only when the version key changes', () => {
    const { bridge, handle } = connected();
    bridge.setScene(robot.scene, robot.floor);
    bridge.setScene(next.scene, next.floor);
    expect(handle.setScene.mock.calls.map(([key]) => key)).toEqual([
      robotKey,
      floorSceneKey(next.scene, next.floor),
    ]);
  });

  it('sends the scene again after the page reloads and reports ready', () => {
    const { bridge, handle } = connected();
    bridge.setScene(robot.scene, robot.floor);
    bridge.setPose(POSE, 0.5);
    bridge.lost();
    bridge.setPose({ ...POSE, x: 9 }, 0.5);
    expect(handle.setPose).toHaveBeenCalledTimes(1);
    bridge.ready();
    expect(handle.setScene).toHaveBeenCalledTimes(2);
    expect(handle.setPose).toHaveBeenLastCalledWith(9, POSE.y, POSE.yaw, 0.5);
  });

  it('does nothing when the native handle is not yet registered', () => {
    const bridge = new Map3dBridge(() => null);
    bridge.setScene(robot.scene, robot.floor);
    bridge.ready();
    expect(() => {
      bridge.setPose(POSE, 0);
    }).not.toThrow();
  });
});

describe('Map3dBridge pose', () => {
  it('sends a pose as four numbers, far smaller than the scene', () => {
    const { bridge, handle } = connected();
    bridge.setScene(robot.scene, robot.floor);
    bridge.setPose(POSE, 0.75);
    const args = handle.setPose.mock.calls[0] ?? [];
    expect(args).toEqual([POSE.x, POSE.y, POSE.yaw, 0.75]);
    expect(JSON.stringify(args).length).toBeLessThan(MAX_POSE_MESSAGE_BYTES);
    expect(robotJson.length).toBeGreaterThan(JSON.stringify(args).length * 20);
  });

  it('skips an unchanged pose and clears the robot when the pose goes away', () => {
    const { bridge, handle } = connected();
    bridge.setScene(robot.scene, robot.floor);
    bridge.setPose(POSE, 0);
    bridge.setPose({ ...POSE }, 0);
    expect(handle.setPose).toHaveBeenCalledTimes(1);
    bridge.setPose(POSE, 1);
    expect(handle.setPose).toHaveBeenCalledTimes(2);
    bridge.setPose(null, 1);
    expect(handle.clearPose).toHaveBeenCalledTimes(1);
    bridge.setPose(null, 1);
    expect(handle.clearPose).toHaveBeenCalledTimes(1);
  });

  it('sends no pose message before there is a pose to show', () => {
    const { bridge, handle } = connected();
    bridge.setScene(robot.scene, robot.floor);
    bridge.setPose(null, 0);
    expect(handle.setPose).not.toHaveBeenCalled();
    expect(handle.clearPose).not.toHaveBeenCalled();
  });
});

interface LiveCall {
  readonly layers: readonly MeshLayer[];
  readonly baseShown: boolean;
}

function fakeRenderer(): SceneRenderer & {
  readonly geometries: SceneGeometry[];
  readonly poses: (VacuumPose | null)[];
  readonly trails: LiveCall[];
} {
  const geometries: SceneGeometry[] = [];
  const poses: (VacuumPose | null)[] = [];
  const trails: LiveCall[] = [];
  return {
    geometries,
    poses,
    trails,
    objects: null,
    live: { setFloor: vi.fn(), setLive: vi.fn() },
    realistic: {
      setScan: vi.fn(),
      setPlacement: vi.fn(),
      setBand: vi.fn(),
      setFloor: vi.fn(),
      setLighting: vi.fn(),
    },
    setGeometry: (geometry) => geometries.push(geometry),
    setPose: (pose) => poses.push(pose),
    setLiveTrail: (layers, baseShown) => trails.push({ layers, baseShown }),
    setPreset: vi.fn(),
    setActive: vi.fn(),
    setEdit: vi.fn(),
    editResult: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('Map3dSession', () => {
  it('builds the geometry once per scene key and ignores a repeated key', () => {
    const renderer = fakeRenderer();
    const session = new Map3dSession(renderer);
    session.loadScene(robotKey, 'vacuum', robotJson);
    session.loadScene(robotKey, 'vacuum', robotJson);
    expect(renderer.geometries).toHaveLength(1);
    expect(renderer.geometries[0]?.version).toBe(robotKey);
  });

  it('rebuilds with the other palette on a theme change and keeps the robot placed', () => {
    const renderer = fakeRenderer();
    const session = new Map3dSession(renderer, 'light');
    session.setPose(POSE.x, POSE.y, POSE.yaw, 0.5);
    session.loadScene(robotKey, 'vacuum', robotJson);
    session.setTheme('light');
    expect(renderer.geometries).toHaveLength(1);
    session.setTheme('dark');
    expect(renderer.geometries).toHaveLength(2);
    expect(renderer.poses.at(-1)).toEqual(POSE);
  });

  it('repaints the robot and the dock when the robot colour changes', () => {
    const renderer = fakeRenderer();
    const session = new Map3dSession(renderer, 'dark');
    session.loadScene(robotKey, 'vacuum', robotJson);
    session.setFinish('graphite');
    expect(renderer.geometries).toHaveLength(1);
    session.setFinish('white');
    expect(renderer.geometries).toHaveLength(2);
    const [graphite, white] = renderer.geometries;
    expect(white?.robot).not.toEqual(graphite?.robot);
  });

  it('applies pose messages without rebuilding the geometry', () => {
    const renderer = fakeRenderer();
    const session = new Map3dSession(renderer);
    session.loadScene(robotKey, 'vacuum', robotJson);
    session.setPose(2, 3, 1, 0);
    session.clearPose();
    expect(renderer.geometries).toHaveLength(1);
    expect(renderer.poses.slice(-2)).toEqual([{ x: 2, y: 3, yaw: 1 }, null]);
  });

  it('rejects a scene that is not a scene', () => {
    const session = new Map3dSession(fakeRenderer());
    expect(() => {
      session.loadScene('9:current', 'vacuum', '{"nope":true}');
    }).toThrow();
  });
});

const LIVE: ShownTrail = {
  base: [
    {
      mopping: false,
      points: [
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ],
    },
  ],
  live: [
    {
      mopping: true,
      points: [
        { x: 1, y: 1 },
        { x: 1.5, y: 1 },
      ],
    },
  ],
};

function sentTrail(handle: ReturnType<typeof fakeHandle>, call: number): string {
  const json = handle.setTrail.mock.calls[call]?.[0];
  return typeof json === 'string' ? json : '';
}

describe('Map3dBridge live trail', () => {
  it('sends a small trail message after the scene and never resends the scene for it', () => {
    const { bridge, handle } = connected();
    bridge.setTrail(LIVE);
    expect(handle.setTrail).not.toHaveBeenCalled();
    bridge.setScene(robot.scene, robot.floor);
    bridge.setTrail(LIVE);
    const grown: ShownTrail = {
      ...LIVE,
      live: [{ mopping: true, points: [...(LIVE.live[0]?.points ?? []), { x: 2, y: 1 }] }],
    };
    bridge.setTrail(grown);
    expect(handle.setScene).toHaveBeenCalledTimes(1);
    expect(handle.setTrail).toHaveBeenCalledTimes(2);
    const json = sentTrail(handle, 1);
    expect(JSON.parse(json)).toStrictEqual({ base: true, live: grown.live });
    expect(json.length).toBeLessThan(200);
  });

  it('resends the trail after a new scene and after the page reloads', () => {
    const { bridge, handle } = connected();
    bridge.setScene(robot.scene, robot.floor);
    bridge.setTrail(LIVE);
    bridge.setScene(next.scene, next.floor);
    expect(handle.setTrail).toHaveBeenCalledTimes(2);
    bridge.ready();
    expect(handle.setTrail).toHaveBeenCalledTimes(3);
    bridge.setTrail({ base: [], live: [] });
    expect(JSON.parse(sentTrail(handle, 3))).toStrictEqual({
      base: false,
      live: [],
    });
  });
});

describe('Map3dBridge live messages', () => {
  it('never carry the scene: only the scene message holds rooms, live ones stay small', () => {
    const { bridge, handle } = connected();
    bridge.setScene(robot.scene, robot.floor);
    for (let step = 0; step < 20; step += 1) {
      bridge.setPose({ x: step / 10, y: 0, yaw: step / 20 }, step % 2);
      bridge.setTrail({
        ...LIVE,
        live: [
          {
            mopping: true,
            points: [
              { x: 0, y: 0 },
              { x: step, y: 1 },
            ],
          },
        ],
      });
    }
    bridge.setPose(null, 0);
    const live = [
      ...handle.setPose.mock.calls,
      ...handle.setTrail.mock.calls,
      ...handle.clearPose.mock.calls,
    ].map((args) => JSON.stringify(args));
    const sceneJson = robotJson;
    const roomName = scene.rooms[0]?.name ?? '';
    expect(roomName).not.toBe('');
    expect(handle.setScene).toHaveBeenCalledTimes(1);
    expect(live).toHaveLength(41);
    expect(
      live.filter((message) => message.includes(roomName) || message.includes('"rooms"')),
    ).toEqual([]);
    expect(Math.max(...live.map((message) => message.length))).toBeLessThan(sceneJson.length / 20);
  });
});

describe('Map3dSession live trail', () => {
  it('replaces only the live ribbon and keeps it across a theme rebuild', () => {
    const renderer = fakeRenderer();
    const session = new Map3dSession(renderer, 'light');
    session.setTrail(JSON.stringify({ base: true, live: LIVE.live }));
    expect(renderer.trails).toHaveLength(0);
    session.loadScene(robotKey, 'vacuum', robotJson);
    session.setTrail(JSON.stringify({ base: false, live: LIVE.live }));
    expect(renderer.geometries).toHaveLength(1);
    expect(renderer.trails.at(-1)?.baseShown).toBe(false);
    expect(renderer.trails.at(-1)?.layers.map((layer) => layer.id)).toEqual(['trail-mop']);
    session.setTheme('dark');
    expect(renderer.geometries).toHaveLength(2);
    expect(renderer.trails.at(-1)?.layers.map((layer) => layer.id)).toEqual(['trail-mop']);
  });

  it('rejects a trail message that is not a trail', () => {
    const session = new Map3dSession(fakeRenderer());
    expect(() => {
      session.setTrail('{"live":3}');
    }).toThrow();
  });
});

describe('failure reporter', () => {
  it('logs each failure kind once', () => {
    const warn = vi.fn();
    const report = createFailureReporter({ warn });
    report('webgl', 'first');
    report('webgl', 'second');
    report('scene', 'bad');
    expect(warn.mock.calls).toEqual([
      ['vacuum.map3d_webgl_unavailable', { detail: 'first' }],
      ['vacuum.map3d_scene_unavailable', { detail: 'bad' }],
    ]);
  });
});

describe('one 3D path for every render scene', () => {
  it('sends a home map floor once per scene revision and floor', () => {
    const { bridge, handle } = connected();
    bridge.setScene(home, homeFloor);
    bridge.setScene({ ...home }, homeFloor);
    expect(handle.setScene).toHaveBeenCalledTimes(1);
    expect(handle.setScene).toHaveBeenCalledWith(
      'home:7:ground',
      'home_map',
      JSON.stringify(homeFloor),
    );
    bridge.setScene({ ...home, key: 'home:8' }, homeFloor);
    bridge.setScene(home, { ...homeFloor, id: 'upstairs' });
    expect(handle.setScene.mock.calls.map(([key]) => key)).toEqual([
      'home:7:ground',
      'home:8:ground',
      'home:7:upstairs',
    ]);
  });

  it('builds a home map floor with its rooms keyed by their render ids and no robot', () => {
    const renderer = fakeRenderer();
    const session = new Map3dSession(renderer);
    session.loadScene('home:7:ground', 'home_map', JSON.stringify(homeFloor));
    const [geometry] = renderer.geometries;
    expect(geometry?.rooms.map((range) => range.roomId)).toEqual(['kitchen', 'hall']);
    expect(geometry?.labels.map((label) => label.roomId)).toEqual(['kitchen', 'hall']);
    expect(geometry?.robot).toEqual([]);
    expect(geometry?.base.map((layer) => layer.id)).toEqual(['floor', 'walls']);
  });

  it('builds the vacuum floor from the wire exactly as from the render scene', () => {
    const renderer = fakeRenderer();
    new Map3dSession(renderer).loadScene(robotKey, 'vacuum', robotJson);
    expect(renderer.geometries[0]).toEqual(
      buildSceneGeometry({ key: robotKey, source: 'vacuum', floor: robot.floor }),
    );
    expect(renderer.geometries[0]?.rooms.map((range) => range.roomId)).toEqual(
      robot.floor.rooms.filter((room) => !room.hidden).map((room) => room.id),
    );
  });

  it('accepts only the known scene sources on the wire', () => {
    expect(SCENE_MESSAGE.safeParse(['k', 'vacuum', '{}']).success).toBe(true);
    expect(SCENE_MESSAGE.safeParse(['k', 'home_map', '{}']).success).toBe(true);
    expect(SCENE_MESSAGE.safeParse(['k', 'other', '{}']).success).toBe(false);
    expect(SCENE_MESSAGE.safeParse(['k', '{}']).success).toBe(false);
  });
});
