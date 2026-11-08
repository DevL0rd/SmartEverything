import { Group, PerspectiveCamera, type Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { floorLighting, type FloorLighting } from '../lighting';
import { floorOf, input, ON, placement } from '../lighting-fixture';
import { FULL_QUALITY } from '../live-visibility/quality-scaler';
import type { RenderFloor } from '../render-scene';
import type { ScanPlacementWire, ScanSource } from './map-3d-protocol';
import { RealisticView, type RelightPort } from './render-core-realistic';
import { SCAN_OPEN_PROBLEM, type ScanPort } from './splat/realistic-layer';
import type { RelightInput } from './splat/relight';

const LIGHTS = [placement('a', 1, 1), placement('b', 3, 3)];

const FLOOR: RenderFloor = { ...floorOf(LIGHTS), elevation: 2.8 };

const lit = (enabled: boolean): FloorLighting =>
  floorLighting({ ...input(LIGHTS, { a: ON, b: ON }, enabled), floor: FLOOR });

const SOURCE: ScanSource = { key: 'map-1:original:aa', url: 'https://hub.test/a', format: 'spz' };

const PLACEMENT: ScanPlacementWire = { tx: 1, ty: 2, tz: 0, yawDeg: 0, scale: 1, opacity: 0.8 };

interface FakePort extends ScanPort {
  readonly scales: number[];
  disposed: boolean;
}

function fakePort(): FakePort {
  const port: FakePort = {
    group: new Group(),
    scales: [],
    disposed: false,
    load: () => Promise.resolve({ splats: 2, loadMs: 1 }),
    setPlacement: vi.fn(),
    setBand: vi.fn(),
    setSplatScale: (scale) => {
      port.scales.push(scale);
    },
    setOpacity: vi.fn(),
    dispose: () => {
      port.disposed = true;
    },
  };
  return port;
}

interface FakeRelight extends RelightPort {
  readonly inputs: RelightInput[];
  readonly composed: number[];
  disposed: boolean;
}

function fakeRelight(): FakeRelight {
  const relight: FakeRelight = {
    edits: new Group(),
    inputs: [],
    composed: [],
    disposed: false,
    setActive: () => true,
    update: (next) => {
      relight.inputs.push(next);
      return true;
    },
    compose: (_camera, width) => {
      relight.composed.push(width);
      return true;
    },
    dispose: () => {
      relight.disposed = true;
    },
  };
  return relight;
}

function setup(
  fetchBytes: (url: string) => Promise<Uint8Array> = () => Promise.resolve(new Uint8Array(4)),
): {
  readonly view: RealisticView;
  readonly ports: FakePort[];
  readonly relights: FakeRelight[];
  readonly structure: Object3D;
  readonly onChange: ReturnType<typeof vi.fn>;
  readonly onFailed: ReturnType<typeof vi.fn>;
} {
  const ports: FakePort[] = [];
  const relights: FakeRelight[] = [];
  const structure = new Group();
  const onChange = vi.fn();
  const onFailed = vi.fn();
  const view = new RealisticView({
    createPort: (): ScanPort => {
      const port = fakePort();
      ports.push(port);
      return port;
    },
    createRelight: (): RelightPort => {
      const relight = fakeRelight();
      relights.push(relight);
      return relight;
    },
    fetchBytes,
    structure,
    log: { info: vi.fn(), warn: vi.fn() },
    onChange,
    onFailed,
  });
  return { view, ports, relights, structure, onChange, onFailed };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

async function shownScan(): Promise<ReturnType<typeof setup>> {
  const parts = setup();
  parts.view.setFloor('home:upstairs', FLOOR);
  parts.view.setScan(SOURCE);
  parts.view.setPlacement(PLACEMENT);
  parts.view.setActive(true);
  parts.view.setView(true);
  await settle();
  return parts;
}

describe('RealisticView', () => {
  it('holds no splat renderer until the Realistic view is shown on a visible stage', async () => {
    const { view, ports } = setup();
    view.setScan(SOURCE);
    view.setActive(true);
    await settle();
    expect(ports).toHaveLength(0);
    view.setView(true);
    await settle();
    expect(ports).toHaveLength(1);
    expect(view.drawn()).toBe(true);
  });

  it('shows the scan instead of the structure once it is loaded and brings the structure back when Realistic is off', async () => {
    const { view, ports, structure } = await shownScan();
    expect(structure.visible).toBe(false);
    view.setView(false);
    expect(structure.visible).toBe(true);
    expect(ports[0]?.disposed).toBe(true);
    expect(view.drawn()).toBe(false);
  });

  it('disposes the splat renderer while the stage is hidden', async () => {
    const { view, ports, structure } = await shownScan();
    view.setActive(false);
    expect(ports[0]?.disposed).toBe(true);
    expect(structure.visible).toBe(true);
  });

  it('feeds the scaler splat scale to the splat renderer', async () => {
    const { view, ports } = await shownScan();
    view.setQuality({ ...FULL_QUALITY, splatScale: 0.5 });
    expect(ports[0]?.scales).toEqual([1, 0.5]);
  });

  it('relights with the same lights toggle and drops the relight pass when it is off', async () => {
    const { view, relights } = await shownScan();
    expect(relights).toHaveLength(0);
    view.setLighting(lit(true));
    expect(relights).toHaveLength(1);
    expect(relights[0]?.inputs.at(-1)?.floor.elevation).toBe(0);
    expect(relights[0]?.inputs.at(-1)?.sceneKey).toBe('home:upstairs');
    view.setLighting(lit(false));
    expect(relights[0]?.disposed).toBe(true);
    expect(view.holdsRelight()).toBe(false);
  });

  it('draws the scan pass and composites the light buffer only while shown', async () => {
    const { view, relights } = await shownScan();
    view.setLighting(lit(true));
    const renderer = { render: vi.fn() };
    const camera = new PerspectiveCamera();
    expect(view.render(renderer, camera, { width: 320, height: 200 })).toBe(true);
    expect(renderer.render).toHaveBeenCalledWith(view.scene, camera);
    expect(relights[0]?.composed).toEqual([320]);
    view.setView(false);
    expect(view.render(renderer, camera, { width: 320, height: 200 })).toBe(false);
    expect(renderer.render).toHaveBeenCalledTimes(1);
  });

  it('puts the shown floor band at the stage ground', () => {
    const { view } = setup();
    view.setBand({ bottom: 2.8, top: 5.4 });
    expect(view.scene.getObjectByName('realistic-lift')?.position.y).toBe(-2.8);
    view.setBand(null);
    expect(view.scene.getObjectByName('realistic-lift')?.position.y).toBe(0);
  });

  it('asks for a frame only when something it shows changed', async () => {
    const { view, onChange } = setup();
    view.setLighting(lit(true));
    view.setFloor('home:upstairs', FLOOR);
    expect(onChange).not.toHaveBeenCalled();
    view.setScan(SOURCE);
    view.setActive(true);
    view.setView(true);
    await settle();
    expect(onChange).toHaveBeenCalled();
  });

  it('reports a scan that failed to load and loads the same scan again when asked', async () => {
    const fetchBytes = vi
      .fn<(url: string) => Promise<Uint8Array>>()
      .mockRejectedValueOnce(new Error('The scan file answered 403'))
      .mockResolvedValue(new Uint8Array(4));
    const { view, onFailed, structure } = setup(fetchBytes);
    view.setScan(SOURCE);
    view.setActive(true);
    view.setView(true);
    await settle();
    expect(onFailed).toHaveBeenCalledWith(SCAN_OPEN_PROBLEM);
    expect(view.drawn()).toBe(false);
    expect(structure.visible).toBe(true);
    view.setScan(SOURCE);
    await settle();
    expect(fetchBytes).toHaveBeenCalledTimes(2);
    expect(view.drawn()).toBe(true);
    view.setScan(SOURCE);
    await settle();
    expect(fetchBytes).toHaveBeenCalledTimes(2);
  });
});
