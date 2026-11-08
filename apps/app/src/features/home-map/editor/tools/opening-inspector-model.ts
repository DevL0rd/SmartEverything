import { randomUUID } from 'expo-crypto';
import {
  homeMapWallLength,
  homeMapWallPointAt,
  openingLiveState,
  type HomeMapOp,
  type HomeMapOpening,
  type HomeMapWall,
  type JsonValue,
} from '@smarteverything/domain';
import type { EditEvent } from '../../../../components/house-map/3d/map-3d-edit-protocol';
import type { IconName } from '../../../../components/icon-glyphs';
import type { Tone } from '../../../../components/tone';
import { compareText } from '../../../../format/text';
import type { Device } from '../../../../store/state';
import {
  LOCKABLE_KINDS,
  OPENING_DEFAULTS,
  openingTap,
  type OpeningKind,
  type WallsOpeningsContext,
} from './walls-openings-model';

export type OpeningChoice = OpeningKind | 'wide_window';
export type OpeningOpens = NonNullable<HomeMapOpening['opens']>;
export type OpeningFamily = 'door' | 'window' | 'opening';
export type LinkField = 'contactDeviceId' | 'lockDeviceId';
type WindowOpens = Exclude<OpeningOpens, 'swing'>;

export const WIDE_WINDOW_M = 1.8;
export const WIDE_FROM_M = 1.5;

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly icon: IconName;
}

export const OPENING_FAMILIES: readonly {
  readonly value: OpeningFamily;
  readonly label: string;
}[] = [
  { value: 'door', label: 'Door' },
  { value: 'window', label: 'Window' },
  { value: 'opening', label: 'Opening' },
];

const FAMILY_KINDS: Readonly<Record<OpeningFamily, readonly Choice<OpeningChoice>[]>> = {
  door: [
    { value: 'door', label: 'Door', icon: 'door' },
    { value: 'double_door', label: 'Double door', icon: 'doorOpen' },
    { value: 'sliding_door', label: 'Sliding door', icon: 'move' },
    { value: 'pocket_door', label: 'Pocket door', icon: 'panelLeft' },
    { value: 'garage_door', label: 'Garage door', icon: 'car' },
  ],
  window: [
    { value: 'window', label: 'Window', icon: 'square' },
    { value: 'wide_window', label: 'Wide window', icon: 'maximize' },
  ],
  opening: [],
};

export const familyOf = (kind: OpeningKind): OpeningFamily =>
  kind === 'window' || kind === 'opening' ? kind : 'door';

export const familyKinds = (family: OpeningFamily): readonly Choice<OpeningChoice>[] =>
  FAMILY_KINDS[family];

export const WINDOW_OPENS: readonly Choice<WindowOpens>[] = [
  { value: 'side_hung', label: 'Side hung', icon: 'doorOpen' },
  { value: 'tilt_turn', label: 'Tilt and turn', icon: 'refresh' },
  { value: 'sliding', label: 'Sliding', icon: 'move' },
  { value: 'fixed', label: 'Fixed', icon: 'square' },
];

export function openingUpdate(
  floorId: string,
  id: string,
  patch: Readonly<Record<string, unknown>>,
): HomeMapOp {
  return { op: 'update', kind: 'opening', floorId, id, patch: { ...patch } };
}

export function resizeOpening(
  floorId: string,
  opening: HomeMapOpening,
  wall: HomeMapWall,
  width: number,
): HomeMapOp | null {
  const length = homeMapWallLength(wall);
  const fitted = Math.min(width, length);
  if (fitted <= 0 || fitted === opening.width) return null;
  const centre = opening.offset + opening.width / 2;
  const offset = Math.min(length - fitted, Math.max(0, centre - fitted / 2));
  return openingUpdate(floorId, opening.id, { width: fitted, offset });
}

export const MIN_GAP_M = 0.1;

export function heightLimits(opening: Pick<HomeMapOpening, 'sillHeight' | 'headHeight'>): {
  readonly sillMax: number;
  readonly headMin: number;
} {
  return { sillMax: opening.headHeight - MIN_GAP_M, headMin: opening.sillHeight + MIN_GAP_M };
}

export const choiceOf = (opening: Pick<HomeMapOpening, 'kind' | 'width'>): OpeningChoice =>
  opening.kind === 'window' && opening.width >= WIDE_FROM_M ? 'wide_window' : opening.kind;

const targetWidth = (current: OpeningChoice, next: OpeningChoice): number | null => {
  if (next === 'wide_window') return WIDE_WINDOW_M;
  return next === 'window' && current === 'wide_window' ? OPENING_DEFAULTS.window.width : null;
};

const linkPatch = (opening: HomeMapOpening, kind: OpeningKind): Record<string, null> => ({
  ...(kind === 'opening' && opening.contactDeviceId !== null ? { contactDeviceId: null } : {}),
  ...(!LOCKABLE_KINDS.has(kind) && opening.lockDeviceId !== null ? { lockDeviceId: null } : {}),
});

export function kindOps(
  floorId: string,
  opening: HomeMapOpening,
  wall: HomeMapWall,
  next: OpeningChoice,
): readonly HomeMapOp[] {
  const current = choiceOf(opening);
  if (next === current) return [];
  const kind = next === 'wide_window' ? 'window' : next;
  const width = targetWidth(current, next);
  const resize = width === null ? null : resizeOpening(floorId, opening, wall, width);
  const ops: HomeMapOp[] = [];
  if (kind !== opening.kind) {
    ops.push(openingUpdate(floorId, opening.id, { kind, ...linkPatch(opening, kind) }));
  }
  if (resize !== null) ops.push(resize);
  return ops;
}

export function familyOps(
  floorId: string,
  opening: HomeMapOpening,
  wall: HomeMapWall,
  family: OpeningFamily,
): readonly HomeMapOp[] {
  return familyOf(opening.kind) === family ? [] : kindOps(floorId, opening, wall, family);
}

export function openingHeightOp(
  floorId: string,
  opening: HomeMapOpening,
  height: number,
): HomeMapOp | null {
  const headHeight = opening.sillHeight + height;
  return headHeight === opening.headHeight
    ? null
    : openingUpdate(floorId, opening.id, { headHeight });
}

export function slideOp(
  floorId: string,
  opening: HomeMapOpening,
  span: { readonly offset: number; readonly width: number },
): HomeMapOp | null {
  if (span.offset === opening.offset && span.width === opening.width) return null;
  return openingUpdate(floorId, opening.id, { offset: span.offset, width: span.width });
}

export const windowOpens = (opening: Pick<HomeMapOpening, 'opens'>): WindowOpens =>
  opening.opens === undefined || opening.opens === 'swing' ? 'side_hung' : opening.opens;

export function swings(opening: Pick<HomeMapOpening, 'kind' | 'opens'>): boolean {
  if (opening.kind === 'door' || opening.kind === 'double_door') return true;
  if (opening.kind !== 'window') return false;
  const opens = windowOpens(opening);
  return opens === 'side_hung' || opens === 'tilt_turn';
}

export interface LinkDevice {
  readonly id: string;
  readonly label: string;
  readonly capabilities: readonly { readonly key: string }[];
}

export const LINK_CAPABILITY: Readonly<Record<LinkField, string>> = {
  contactDeviceId: 'contact',
  lockDeviceId: 'lock',
};

export function linkCandidates<D extends LinkDevice>(
  devices: readonly D[],
  field: LinkField,
): readonly D[] {
  const key = LINK_CAPABILITY[field];
  return devices
    .filter((device) => device.capabilities.some((capability) => capability.key === key))
    .sort((a, b) => compareText(a.label, b.label));
}

export function linkOp(
  floorId: string,
  opening: HomeMapOpening,
  field: LinkField,
  deviceId: string | null,
): HomeMapOp | null {
  return opening[field] === deviceId
    ? null
    : openingUpdate(floorId, opening.id, { [field]: deviceId });
}

export interface LinkStatus {
  readonly text: string;
  readonly tone: Tone;
  readonly icon: IconName;
}

const WORDS: Readonly<Record<LinkField, readonly [LinkStatus, LinkStatus]>> = {
  contactDeviceId: [
    { text: 'Open now', tone: 'warning', icon: 'doorOpen' },
    { text: 'Closed now', tone: 'positive', icon: 'door' },
  ],
  lockDeviceId: [
    { text: 'Locked now', tone: 'positive', icon: 'lock' },
    { text: 'Unlocked now', tone: 'warning', icon: 'lockOpen' },
  ],
};

export function linkStatus(
  field: LinkField,
  device: Pick<Device, 'id' | 'online'>,
  value: JsonValue | null,
): LinkStatus {
  const [yes, no] = WORDS[field];
  const reading = { online: device.online, open: typeof value === 'boolean' ? value : null };
  const state = openingLiveState({ contactDeviceId: device.id }, new Map([[device.id, reading]]));
  if (state === 'open') return yes;
  if (state === 'closed') return no;
  return {
    text: device.online ? 'No reading yet' : 'Offline',
    tone: 'variant',
    icon: device.online ? 'circle' : 'wifi',
  };
}

export const plainText = (field: LinkField, kind: OpeningKind): string => {
  if (field === 'lockDeviceId') return 'None, no lock';
  return kind === 'window' ? 'None, a plain window' : 'None, a plain door';
};

type OpeningsTapEdit = Extract<EditEvent, { readonly type: 'tap' }>;

const shortText = (width: number): string =>
  `This wall is shorter than ${width.toFixed(2)} m. Pick a longer wall or a narrower kind.`;

function dropOpening(context: WallsOpeningsContext, wall: HomeMapWall, offset: number): void {
  const point = homeMapWallPointAt(wall, offset);
  const tap = openingTap(context.floor, point, context.state.openingKind, () => randomUUID());
  if (tap.kind === 'short') {
    context.dispatch({ type: 'notice', notice: shortText(tap.width) });
    return;
  }
  if (tap.kind === 'none') return;
  if (tap.kind === 'add') context.edit([tap.op]);
  context.dispatch({ type: 'pick', picked: { kind: 'opening', id: tap.id } });
}

export function openingsTap(context: WallsOpeningsContext, tap: OpeningsTapEdit): void {
  const { hit } = tap;
  if (hit.kind === 'opening') {
    context.dispatch({ type: 'pick', picked: { kind: 'opening', id: hit.id } });
    return;
  }
  const wall =
    hit.kind === 'wall' ? (context.floor.walls.find((item) => item.id === hit.id) ?? null) : null;
  if (wall === null || hit.kind !== 'wall' || context.readOnly) {
    context.dispatch({ type: 'pick', picked: null });
    return;
  }
  dropOpening(context, wall, hit.offset);
}
