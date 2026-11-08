import type { ModelSignalValue, ModelSpec } from '@smarteverything/domain';
import { Raycaster, Vector2, type Object3D } from 'three';
import type { ChannelSignals } from '../../../components/models/channels';
import type { BuiltModel } from '../../../components/models/three/build-model';
import {
  createViewCamera,
  frameView,
  type CameraPose,
  type ModelView,
} from '../../../components/models/three/framing';

export interface LiveInspect {
  readonly yaw: number;
  readonly pitch: number;
  readonly zoom: number;
}

export const INSPECT_START: LiveInspect = { yaw: 0, pitch: 0, zoom: 1 };

export const POLE_PITCH = 89;

export const DRAG_DEGREES_PER_WIDTH = 180;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function nearestZoom(framed: CameraPose): number {
  return framed.reach > 0 ? framed.distance / framed.reach : Number.POSITIVE_INFINITY;
}

export function clampInspect(inspect: LiveInspect, framed: CameraPose): LiveInspect {
  const pitch = clamp(framed.pitch + inspect.pitch, -POLE_PITCH, POLE_PITCH) - framed.pitch;
  const zoom = Math.min(inspect.zoom, nearestZoom(framed));
  return { yaw: inspect.yaw, pitch, zoom };
}

export function inspectPose(framed: CameraPose, inspect: LiveInspect): CameraPose {
  const held = clampInspect(inspect, framed);
  return {
    ...framed,
    yaw: framed.yaw + held.yaw,
    pitch: framed.pitch + held.pitch,
    distance: framed.distance / held.zoom,
  };
}

export function dragInspect(
  inspect: LiveInspect,
  move: { readonly dx: number; readonly dy: number; readonly widthPx: number },
): LiveInspect {
  if (!(move.widthPx > 0)) return inspect;
  const perPx = DRAG_DEGREES_PER_WIDTH / move.widthPx;
  return {
    yaw: inspect.yaw - move.dx * perPx,
    pitch: inspect.pitch + move.dy * perPx,
    zoom: inspect.zoom,
  };
}

export function zoomInspect(inspect: LiveInspect, scale: number): LiveInspect {
  if (!(scale > 0) || !Number.isFinite(scale)) return inspect;
  return { ...inspect, zoom: inspect.zoom * scale };
}

export interface InspectTap {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function partOf(model: BuiltModel, object: Object3D): string | null {
  for (let at: Object3D | null = object; at !== null; at = at.parent) {
    const part = model.parts.find((candidate) => candidate.mesh === at);
    if (part !== undefined) return part.id;
  }
  return null;
}

export function inspectCamera(
  model: BuiltModel,
  spec: ModelSpec,
  view: ModelView,
  frame: { readonly inspect: LiveInspect; readonly aspect: number },
): CameraPose {
  return inspectPose(frameView(model, spec, view, frame.aspect), frame.inspect);
}

export function pickPart(model: BuiltModel, pose: CameraPose, tap: InspectTap): string | null {
  if (!(tap.width > 0) || !(tap.height > 0)) return null;
  const view = createViewCamera();
  view.apply(pose, tap.width / tap.height);
  model.group.updateMatrixWorld(true);
  const ndc = new Vector2((tap.x / tap.width) * 2 - 1, 1 - (tap.y / tap.height) * 2);
  const ray = new Raycaster();
  ray.setFromCamera(ndc, view.camera);
  const meshes = model.parts.filter((part) => part.mesh.visible).map((part) => part.mesh);
  for (const hit of ray.intersectObjects(meshes, false)) {
    const id = partOf(model, hit.object);
    if (id !== null) return id;
  }
  return null;
}

export interface PartReading {
  readonly kind: 'signal' | 'capability';
  readonly name: string;
  readonly value: ModelSignalValue | undefined;
}

export interface PartReadout {
  readonly part: string;
  readonly readings: readonly PartReading[];
}

export interface ReadoutSources {
  readonly signals: ChannelSignals;
  readonly capabilities: ChannelSignals;
}

function lineage(spec: ModelSpec, partId: string): ReadonlySet<string> {
  const parents = new Map(spec.parts.map((part) => [part.id, part.parent]));
  const found = new Set<string>();
  for (let at: string | undefined = partId; at !== undefined && !found.has(at);) {
    found.add(at);
    at = parents.get(at) ?? undefined;
  }
  return found;
}

export function partReadout(spec: ModelSpec, partId: string, sources: ReadoutSources): PartReadout {
  const chain = lineage(spec, partId);
  const readings = new Map<string, PartReading>();
  for (const channel of spec.channels ?? []) {
    if (!chain.has(channel.target)) continue;
    const { source } = channel;
    const reading: PartReading =
      typeof source === 'string'
        ? { kind: 'signal', name: source, value: sources.signals[source] }
        : {
            kind: 'capability',
            name: source.capability,
            value: sources.capabilities[source.capability],
          };
    readings.set(`${reading.kind}:${reading.name}`, reading);
  }
  return { part: partId, readings: [...readings.values()] };
}

function words(name: string): string {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_.]+/g, ' ')
    .trim()
    .toLowerCase();
  return spaced.length === 0 ? name : `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`;
}

export function partTitle(partId: string): string {
  return words(partId);
}

function valueText(value: ModelSignalValue | undefined): string {
  if (value === undefined || value === null) return 'No reading';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'number') return String(Math.round(value * 100) / 100);
  return value;
}

export function readingText(reading: PartReading): string {
  return `${words(reading.name)}: ${valueText(reading.value)}`;
}
