import { describe, expect, it, vi } from 'vitest';
import { Group, Vector3 } from 'three';
import type { ScanBand, ScanPlacementWire, ScanSource } from '../map-3d-protocol';
import {
  RealisticLayer,
  SCAN_DOWNLOAD_PROBLEM,
  SCAN_OPEN_PROBLEM,
  ScanFetchError,
  scanPlacementInWorld,
  scanProblemOf,
  type RealisticLayerOptions,
  type ScanPort,
} from './realistic-layer';
import { applyPlacement } from './spark-loader';

interface FakePort extends ScanPort {
  readonly calls: string[];
  readonly bands: (ScanBand | null)[];
  readonly scales: number[];
  readonly opacities: number[];
  disposed: boolean;
}

function fakePort(): FakePort {
  const port: FakePort = {
    group: new Group(),
    calls: [],
    bands: [],
    scales: [],
    opacities: [],
    disposed: false,
    load: () => {
      port.calls.push('load');
      return Promise.resolve({ splats: 26_000, loadMs: 5 });
    },
    setPlacement: () => {
      port.calls.push('placement');
    },
    setBand: (band) => {
      port.bands.push(band);
    },
    setSplatScale: (scale) => {
      port.scales.push(scale);
    },
    setOpacity: (opacity) => {
      port.opacities.push(opacity);
    },
    dispose: () => {
      port.disposed = true;
    },
  };
  return port;
}

const SOURCE: ScanSource = { key: 'map-1:original:aa', url: 'https://hub.test/a', format: 'spz' };
const OTHER: ScanSource = { key: 'map-2:original:bb', url: 'https://hub.test/b', format: 'ply' };
const PLACEMENT: ScanPlacementWire = { tx: 1, ty: 2, tz: 0.1, yawDeg: 90, scale: 2, opacity: 0.8 };

function setup(
  fetchBytes: RealisticLayerOptions['fetchBytes'] = () => Promise.resolve(new Uint8Array(4)),
): {
  readonly layer: RealisticLayer;
  readonly ports: FakePort[];
  readonly options: RealisticLayerOptions;
} {
  const ports: FakePort[] = [];
  const options: RealisticLayerOptions = {
    createPort: () => {
      const port = fakePort();
      ports.push(port);
      return port;
    },
    fetchBytes: vi.fn(fetchBytes),
    log: { info: vi.fn(), warn: vi.fn() },
    onLoaded: vi.fn(),
    onFailed: vi.fn(),
  };
  return { layer: new RealisticLayer(options), ports, options };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('RealisticLayer visibility', () => {
  it('holds no Spark renderer while the stage is not visible', async () => {
    const { layer, ports, options } = setup();
    layer.setScan(SOURCE);
    layer.setPlacement(PLACEMENT);
    await settle();
    expect(layer.holdsRenderer()).toBe(false);
    expect(ports).toHaveLength(0);
    expect(options.fetchBytes).not.toHaveBeenCalled();
  });

  it('creates the renderer when visible and disposes it as soon as the stage is hidden', async () => {
    const { layer, ports } = setup();
    layer.setScan(SOURCE);
    layer.setActive(true);
    await settle();
    expect(layer.holdsRenderer()).toBe(true);
    layer.setActive(false);
    expect(layer.holdsRenderer()).toBe(false);
    expect(ports[0]?.disposed).toBe(true);
    expect(layer.group.children).toHaveLength(0);
    layer.setActive(true);
    await settle();
    expect(ports).toHaveLength(2);
    expect(ports[1]?.calls).toContain('load');
  });

  it('drops a load that finishes after the stage was hidden', async () => {
    let release: (bytes: Uint8Array) => void = () => undefined;
    const { layer, ports, options } = setup(
      () =>
        new Promise<Uint8Array>((resolve) => {
          release = resolve;
        }),
    );
    layer.setScan(SOURCE);
    layer.setActive(true);
    layer.setActive(false);
    release(new Uint8Array(4));
    await settle();
    expect(ports[0]?.calls).not.toContain('load');
    expect(options.onLoaded).not.toHaveBeenCalled();
  });

  it('holds no renderer for a map without a scan', () => {
    const { layer } = setup();
    layer.setActive(true);
    expect(layer.holdsRenderer()).toBe(false);
  });
});

describe('RealisticLayer messages', () => {
  it('loads once per scan and swaps the renderer when the scan changes', async () => {
    const { layer, ports, options } = setup();
    layer.setActive(true);
    layer.setScan(SOURCE);
    layer.setScan(SOURCE);
    await settle();
    expect(options.fetchBytes).toHaveBeenCalledTimes(1);
    layer.setScan(OTHER);
    await settle();
    expect(ports[0]?.disposed).toBe(true);
    expect(options.fetchBytes).toHaveBeenLastCalledWith(OTHER.url);
    layer.setScan(null);
    expect(layer.holdsRenderer()).toBe(false);
  });

  it('applies transform edits to the loaded scan without reloading it', async () => {
    const { layer, ports, options } = setup();
    layer.setActive(true);
    layer.setScan(SOURCE);
    layer.setPlacement(PLACEMENT);
    await settle();
    layer.setPlacement({ ...PLACEMENT, yawDeg: 45, opacity: 0.5 });
    expect(options.fetchBytes).toHaveBeenCalledTimes(1);
    expect(ports[0]?.calls.filter((call) => call === 'load')).toHaveLength(1);
    expect(ports[0]?.opacities.at(-1)).toBe(0.5);
  });

  it('passes the splat budget and floor band to a renderer made later', async () => {
    const { layer, ports } = setup();
    layer.setSplatScale(0.5);
    layer.setBand({ bottom: 0, top: 2.6 });
    layer.setScan(SOURCE);
    layer.setActive(true);
    await settle();
    expect(ports[0]?.scales).toEqual([0.5]);
    expect(ports[0]?.bands).toEqual([{ bottom: 0, top: 2.6 }]);
    layer.setSplatScale(0.35);
    expect(ports[0]?.scales).toEqual([0.5, 0.35]);
  });

  it('logs and reports a scan file that cannot be read', async () => {
    const { layer, options } = setup(() => Promise.reject(new Error('answered 404')));
    layer.setScan(SOURCE);
    layer.setActive(true);
    await settle();
    expect(options.log.warn).toHaveBeenCalledWith('house_map.scan_load_failed', {
      format: 'spz',
      detail: 'answered 404',
    });
    expect(options.onFailed).toHaveBeenCalledWith(SCAN_OPEN_PROBLEM);
  });

  it('tells a download failure apart from a file that cannot be opened', () => {
    expect(scanProblemOf(new ScanFetchError('The scan file answered 500'))).toBe(
      SCAN_DOWNLOAD_PROBLEM,
    );
    expect(scanProblemOf(new Error('bad header'))).toBe(SCAN_OPEN_PROBLEM);
  });

  it('loads a failed scan again when the same scan is asked for, and only then', async () => {
    const { layer, ports, options } = setup(() => Promise.reject(new Error('answered 404')));
    layer.setScan(SOURCE);
    layer.setActive(true);
    await settle();
    expect(layer.setScan(SOURCE)).toBe(true);
    await settle();
    expect(options.fetchBytes).toHaveBeenCalledTimes(2);
    expect(ports[0]?.disposed).toBe(true);
    expect(ports).toHaveLength(2);
  });

  it('keeps a loaded scan when the same scan is asked for again', async () => {
    const { layer, ports } = setup();
    layer.setScan(SOURCE);
    layer.setActive(true);
    await settle();
    expect(layer.setScan(SOURCE)).toBe(false);
    expect(ports).toHaveLength(1);
  });
});

describe('scanPlacementInWorld', () => {
  it('places a scan point where the map frame puts the same plan point', () => {
    const target = new Group();
    applyPlacement(target, scanPlacementInWorld(PLACEMENT));
    const scanPoint = new Vector3(1, 0.5, 0);
    const world = target.localToWorld(scanPoint.clone());
    expect(world.x).toBeCloseTo(1);
    expect(world.y).toBeCloseTo(1.1);
    expect(world.z).toBeCloseTo(-4);
  });
});
