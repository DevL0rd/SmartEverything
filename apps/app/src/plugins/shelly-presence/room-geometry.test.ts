import { describe, expect, it } from 'vitest';
import { SHELLY_DEVICE, type ShellyArea } from '@smarteverything/shelly';
import { sensorOrigin } from './area-context';
import {
  cellsAt,
  cellsOf,
  DEFAULT_ROOM,
  frameOf,
  gridToView,
  labelSpotOf,
  modelFor,
  outerLoops,
  outlineOf,
  pathOf,
  shapeOf,
  sizeOf,
  trackToGrid,
  trackToView,
} from './room-geometry';

const CENTRE = sensorOrigin('center');

describe('sensor origin', () => {
  it('places the sensor at the left edge, centre or right edge of the grid', () => {
    expect([sensorOrigin('left'), sensorOrigin('center'), sensorOrigin('right')]).toEqual([
      0, 8, 16,
    ]);
  });

  it('mirrors a grid point around the origin of each mounting position', () => {
    expect(gridToView({ x: 4, y: 6 }, sensorOrigin('left'))).toEqual({ x: -2, y: 3 });
    expect(gridToView({ x: 4, y: 6 }, sensorOrigin('center'))).toEqual({ x: 2, y: 3 });
    expect(gridToView({ x: 4, y: 6 }, sensorOrigin('right'))).toEqual({ x: 6, y: 3 });
  });
});

describe('tracks', () => {
  it('turns metres into 0.5 m grid cells', () => {
    expect(trackToGrid({ x: 1.5, y: 3 })).toEqual({ x: 3, y: 6 });
  });

  it('lands a track on the same place as the cell it stands in', () => {
    const area: ShellyArea = [[2, 4, 4, 8]];
    const track = { x: 1.25, y: 2.5 };
    const view = trackToView(track, CENTRE);
    expect(cellsAt(cellsOf(area, CENTRE), view)).toBe(true);
    expect(cellsAt(cellsOf(area, CENTRE), { x: view.x + 2, y: view.y })).toBe(false);
  });

  it('keeps y growing away from the sensor wall for every position', () => {
    for (const position of ['left', 'center', 'right'] as const) {
      const near = trackToView({ x: 0, y: 1 }, sensorOrigin(position));
      const far = trackToView({ x: 0, y: 4 }, sensorOrigin(position));
      expect(far.y).toBeGreaterThan(near.y);
    }
  });
});

describe('zone outline', () => {
  it('merges overlapping segments into one outline', () => {
    const area: ShellyArea = [
      [0, 0, 4, 2],
      [0, 2, 2, 4],
    ];
    const loops = outlineOf(cellsOf(area, 0));
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(6);
  });

  it('keeps a hole inside a zone as a second loop', () => {
    const ring: ShellyArea = [
      [0, 0, 6, 2],
      [0, 4, 6, 6],
      [0, 2, 2, 4],
      [4, 2, 6, 4],
    ];
    expect(outlineOf(cellsOf(ring, 0))).toHaveLength(2);
  });

  it('counts separate shapes but not the holes inside them', () => {
    const apart: ShellyArea = [
      [0, 0, 2, 2],
      [6, 0, 8, 2],
    ];
    const ring: ShellyArea = [
      [0, 0, 6, 2],
      [0, 4, 6, 6],
      [0, 2, 2, 4],
      [4, 2, 6, 4],
    ];
    expect(outerLoops(outlineOf(cellsOf(apart, 0)))).toBe(2);
    expect(outerLoops(outlineOf(cellsOf(ring, 0)))).toBe(1);
  });

  it('writes the outline in metres', () => {
    expect(pathOf(outlineOf(cellsOf([[0, 0, 4, 2]], 4)))).toBe('M0 0L2 0L2 1L0 1Z');
  });
});

describe('metres bounds', () => {
  it('measures a shape in metres from the sensor wall', () => {
    const shape = shapeOf([[-4, 2, 4, 12]], CENTRE);
    expect(shape?.bounds).toEqual({ left: 2, top: 1, right: 6, bottom: 6 });
  });

  it('frames the default room with space for the wall ticks and the scale bar', () => {
    const { view } = frameOf(DEFAULT_ROOM, [], CENTRE, false);
    expect(sizeOf(DEFAULT_ROOM)).toEqual({ width: 8, height: 10 });
    expect(view.left).toBeLessThan(0);
    expect(view.top).toBeLessThan(0);
    expect(view.right).toBeGreaterThan(8);
    expect(view.bottom).toBeGreaterThan(10);
  });

  it('grows the frame to hold a zone outside the default room', () => {
    const shape = shapeOf([[-24, 0, -16, 4]], CENTRE);
    const { view } = frameOf(DEFAULT_ROOM, shape === null ? [] : [shape.bounds], CENTRE, true);
    expect(view.right).toBeGreaterThan(DEFAULT_ROOM.right + 4);
  });
});

describe('label point', () => {
  it('sits inside a rectangle at its middle', () => {
    const cells = cellsOf([[0, 0, 8, 4]], 8);
    const spot = labelSpotOf(cells);
    expect(spot).toMatchObject({ width: 4, height: 2 });
    expect(Math.abs((spot?.x ?? 0) - 2)).toBeLessThanOrEqual(0.25);
    expect(Math.abs((spot?.y ?? 0) - 1)).toBeLessThanOrEqual(0.25);
  });

  it('stays inside an L-shaped zone where the centre of its bounds does not', () => {
    const area: ShellyArea = [
      [0, 0, 10, 2],
      [0, 2, 2, 12],
    ];
    const cells = cellsOf(area, 10);
    const spot = labelSpotOf(cells);
    expect(spot).not.toBeNull();
    expect(cellsAt(cells, { x: spot?.x ?? -1, y: spot?.y ?? -1 })).toBe(true);
    expect(cellsAt(cells, { x: 2.5, y: 3 })).toBe(false);
  });

  it('reports the free run through the point so a label can be hidden when it does not fit', () => {
    const spot = labelSpotOf(cellsOf([[0, 0, 2, 2]], 2));
    expect(spot).toMatchObject({ width: 1, height: 1 });
  });

  it('has no point for an empty zone', () => {
    expect(labelSpotOf(cellsOf([], 8))).toBeNull();
    expect(shapeOf([], 8)).toBeNull();
  });
});

function sensorWith(options: {
  readonly position?: 'left' | 'center' | 'right';
  readonly blind?: ShellyArea;
  readonly occupied?: boolean;
}): ReturnType<typeof SHELLY_DEVICE.parse> {
  return SHELLY_DEVICE.parse({
    id: 'radar-1',
    externalId: 'shelly-presence:radar-1',
    name: 'Hall radar',
    address: 'http://127.0.0.1',
    info: {
      id: 'radar-1',
      mac: 'AABBCC',
      model: 'S4SN-0U61X',
      gen: 4,
      fw_id: 'x',
      ver: '1',
      app: 'presence',
      auth_en: false,
    },
    connection: { state: 'online', reason: null },
    observedAt: null,
    config: {
      enable: true,
      main_zone: 'presencezone:200',
      sensor: { position: options.position ?? 'center' },
      blind: options.blind ?? [],
    },
    status: {},
    revision: 1,
    zones: [
      {
        key: 'presencezone:200',
        externalId: 'shelly-presence:radar-1',
        generation: 0,
        main: true,
        config: { id: 200, enable: true, area: [[-8, 0, 8, 20]] },
        status: { id: 200, value: false, num_objects: 0 },
      },
      {
        key: 'presencezone:201',
        externalId: 'shelly-presence:radar-1:201:0',
        generation: 0,
        main: false,
        config: { id: 201, enable: true, area: [[0, 4, 4, 8]] },
        status: { id: 201, value: options.occupied ?? false, num_objects: 0 },
      },
    ],
    light: [],
    tracks: [],
    tracksAt: null,
    methods: [],
    componentKeys: [],
    features: [],
    components: [],
    discoveredBthome: [],
  });
}

describe('map model', () => {
  it('takes the room from the main zone and measures it in metres', () => {
    const model = modelFor(sensorWith({}), undefined, false);
    expect(sizeOf(model.frame.room)).toEqual({ width: 8, height: 10 });
    expect(model.shapes.get('presencezone:201')?.bounds).toEqual({
      left: 2,
      top: 2,
      right: 4,
      bottom: 4,
    });
  });

  it('moves the sensor and the zones with the mounting position', () => {
    const left = modelFor(sensorWith({ position: 'left' }), undefined, false);
    const right = modelFor(sensorWith({ position: 'right' }), undefined, false);
    expect(left.origin).toBe(0);
    expect(right.origin).toBe(16);
    expect(left.shapes.get('presencezone:201')?.bounds.left).toBeLessThan(0);
    expect(right.shapes.get('presencezone:201')?.bounds.left).toBe(6);
  });

  it('counts separate blind spots', () => {
    const blind: ShellyArea = [
      [0, 0, 2, 2],
      [6, 6, 8, 8],
    ];
    expect(modelFor(sensorWith({ blind }), undefined, false).blind.count).toBe(2);
    expect(modelFor(sensorWith({}), undefined, false).blind.count).toBe(0);
  });

  it('reuses the model while only occupancy changes', () => {
    const clear = modelFor(sensorWith({ occupied: false }), undefined, false);
    const busy = modelFor(sensorWith({ occupied: true }), undefined, false);
    expect(busy).toBe(clear);
    expect(modelFor(sensorWith({}), undefined, true)).not.toBe(clear);
  });

  it('holds the highlighted area of the editor inside the frame', () => {
    const far: ShellyArea = [[-30, 0, -20, 4]];
    const model = modelFor(sensorWith({}), far, false);
    expect(model.area?.bounds.right).toBeGreaterThan(8);
    expect(model.frame.view.right).toBeGreaterThan(model.area?.bounds.right ?? 0);
  });
});
