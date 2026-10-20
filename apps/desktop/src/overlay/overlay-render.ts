import {
  OVERLAY_LABELS,
  overlayDuration,
  type OverlayControl,
  type OverlayHostView,
  type OverlaySetup,
  type OverlayTile,
} from '@smarteverything/domain/voice-overlay';
import type { IconName } from './overlay-icons';

export type ControlId = Exclude<OverlayControl, 'interrupt'>;

export interface ControlModel {
  readonly id: ControlId;
  readonly look: 'icon' | 'chip' | 'text';
  readonly icon: IconName | null;
  readonly label: string;
  readonly tip: string;
  readonly pressed: boolean | null;
  readonly expanded: boolean | null;
  readonly dot: boolean;
  readonly critical: boolean;
}

export interface TextModel {
  readonly key: string;
  readonly status: string;
  readonly detail: string | null;
  readonly caption: string | null;
  readonly single: boolean;
  readonly error: boolean;
}

type MeterKind = 'ribbon' | 'mini' | null;

export interface PillModel {
  readonly mode: OverlayHostView['mode'];
  readonly state: OverlayHostView['state'];
  readonly theme: OverlayHostView['theme'];
  readonly position: OverlayHostView['prefs']['position'];
  readonly reducedMotion: boolean;
  readonly orb: OverlayHostView['orb'];
  readonly dim: boolean;
  readonly muted: boolean;
  readonly stopOrb: boolean;
  readonly meter: MeterKind;
  readonly meterStop: boolean;
  readonly text: TextModel;
  readonly controls: readonly ControlModel[];
  readonly chip: ChipModel | null;
}

export interface ChipModel {
  readonly icon: IconName;
  readonly label: string;
  readonly description: string;
  readonly warm: boolean;
}

export interface TileModel {
  readonly id: OverlayTile['id'];
  readonly icon: IconName;
  readonly label: string;
  readonly tip: string;
  readonly pressed: boolean | null;
  readonly disabled: boolean;
  readonly critical: boolean;
}

export interface MicOption {
  readonly id: string;
  readonly label: string;
}

export interface TrayModel {
  readonly theme: OverlayHostView['theme'];
  readonly position: OverlayHostView['prefs']['position'];
  readonly mode: OverlayHostView['mode'];
  readonly assistant: string;
  readonly subtitle: string;
  readonly tiles: readonly TileModel[];
  readonly mics: readonly MicOption[];
  readonly micId: string;
  readonly volume: number;
  readonly setup: OverlaySetup;
}

export interface CardModel {
  readonly theme: OverlayHostView['theme'];
  readonly position: OverlayHostView['prefs']['position'];
  readonly mode: OverlayHostView['mode'];
  readonly title: string;
  readonly why: string;
  readonly accept: string;
  readonly decline: string;
  readonly name: string;
}

export interface GlowModel {
  readonly mode: 'listening' | 'thinking' | 'speaking' | 'off';
  readonly bloom: boolean;
  readonly visible: boolean;
  readonly still: boolean;
  readonly theme: OverlayHostView['theme'];
}

const NOT_NOW = 'Not now';
const AUTOMATIC_MICROPHONE = 'Automatic';
export const SYSTEM_SPEAKER_NOTE =
  'Plays on the system speaker. Change it in system sound settings.';
export const GLOW_STILL_SCALE = 32 / 140;

const BAR_METERS = ['listening', 'thinking', 'speaking', 'reconnecting'];
const FULL_METERS = ['wake', 'listening', 'thinking', 'speaking'];
const DIM_STATES = ['reconnecting', 'error'];

const TILE_ICONS: Readonly<Record<OverlayTile['id'], IconName>> = {
  camera: 'cam',
  pause_video: 'pause',
  show_this: 'eye',
  share_screen: 'share',
  stop_share: 'stopShare',
  share_window: 'win',
  home_camera: 'house',
  interrupt: 'stopTalk',
  speaker: 'vol',
  captions: 'cc',
  settings: 'tune',
};

const TILE_HINTS: Readonly<Partial<Record<OverlayTile['id'], string>>> = {
  show_this: 'Send one still picture of your screen',
  home_camera: 'Show a home camera to the assistant',
  interrupt: 'Stop the assistant talking',
};

export function barModeOf(view: OverlayHostView): boolean {
  return view.mode !== 'full';
}

function control(id: ControlId, part: Partial<ControlModel>): ControlModel {
  return {
    id,
    look: 'icon',
    icon: null,
    label: OVERLAY_LABELS[id],
    tip: OVERLAY_LABELS[id],
    pressed: null,
    expanded: null,
    dot: false,
    critical: false,
    ...part,
  };
}

function cameraOn(view: OverlayHostView): boolean {
  return view.camera === 'on' || view.camera === 'paused' || view.camera === 'starting';
}

type ControlLook = (view: OverlayHostView, trayOpen: boolean) => Partial<ControlModel>;

const LOOKS: Readonly<Record<ControlId, ControlLook>> = {
  mute: (view) => ({
    icon: view.muted ? 'micOff' : 'mic',
    tip: view.muted ? 'Unmute' : 'Mute',
    pressed: view.muted,
  }),
  speaker: (view) => ({ icon: 'vol', pressed: view.speaker === true }),
  camera: (view) => ({
    icon: cameraOn(view) ? 'cam' : 'camOff',
    tip: cameraOn(view) ? 'Turn camera off' : 'Turn camera on',
    pressed: cameraOn(view),
    dot: view.camera === 'on',
  }),
  share: () => ({ icon: 'share' }),
  more: (view, trayOpen) => ({
    icon: trayOpen !== (view.mode === 'compact') ? 'less' : 'more',
    expanded: trayOpen,
  }),
  stop_share: () => ({ look: 'chip', icon: 'stopShare' }),
  end: () => ({ icon: 'end', critical: true }),
  retry: () => ({ look: 'text' }),
  fix: () => ({ look: 'text' }),
  close: () => ({ icon: 'close' }),
};

function controlOf(id: ControlId, view: OverlayHostView, trayOpen: boolean): ControlModel {
  return control(id, LOOKS[id](view, trayOpen));
}

function controlsOf(view: OverlayHostView, trayOpen: boolean): readonly ControlModel[] {
  return view.controls
    .filter((id): id is ControlId => id !== 'interrupt')
    .map((id) => controlOf(id, view, trayOpen));
}

function meterOf(view: OverlayHostView, controls: number): MeterKind {
  if (barModeOf(view)) {
    return BAR_METERS.includes(view.state) ? 'mini' : null;
  }
  return FULL_METERS.includes(view.state) && controls <= 5 ? 'ribbon' : null;
}

export function textOf(view: OverlayHostView): TextModel {
  const bar = barModeOf(view);
  const caption = bar ? null : view.caption;
  const single = caption === null;
  return {
    key: [view.state, view.status, view.detail ?? '', single ? 's' : 'c'].join('|'),
    status: view.status,
    detail: view.detail,
    caption,
    single,
    error: view.state === 'error',
  };
}

function chipOf(view: OverlayHostView): ChipModel | null {
  const { chip } = view;
  if (chip === null || !barModeOf(view)) {
    return null;
  }
  return {
    icon: chip.level === 'off' ? 'brainOff' : 'brain',
    label: chip.label,
    description: chip.description,
    warm: chip.warm,
  };
}

export function pillModel(view: OverlayHostView, trayOpen: boolean): PillModel {
  const controls = controlsOf(view, trayOpen);
  const stoppable = view.controls.includes('interrupt');
  const bar = barModeOf(view);
  return {
    mode: view.mode,
    state: view.state,
    theme: view.theme,
    position: view.prefs.position,
    reducedMotion: view.reducedMotion,
    orb: view.orb,
    dim: DIM_STATES.includes(view.state),
    muted: view.muted,
    stopOrb: stoppable && !bar,
    meter: meterOf(view, controls.length),
    meterStop: stoppable && bar,
    text: textOf(view),
    controls,
    chip: chipOf(view),
  };
}

function elapsed(from: number | null, now: number): string | null {
  return from === null ? null : overlayDuration(from, now);
}

function tileOf(tile: OverlayTile): TileModel {
  return {
    id: tile.id,
    icon: tile.id === 'camera' && tile.pressed !== true ? 'camOff' : TILE_ICONS[tile.id],
    label: tile.label,
    tip: tile.disabled ?? TILE_HINTS[tile.id] ?? tile.label,
    pressed: tile.pressed,
    disabled: tile.disabled !== null,
    critical: tile.critical,
  };
}

export function trayModel(view: OverlayHostView, now: number): TrayModel | null {
  const { tray } = view;
  if (tray === null) {
    return null;
  }
  const time = elapsed(tray.elapsedFrom, now);
  const parts = [tray.chat, time].filter((part): part is string => part !== null);
  return {
    theme: view.theme,
    position: view.prefs.position,
    mode: view.mode,
    assistant: tray.assistant,
    subtitle: parts.join(' · '),
    tiles: tray.tiles.map(tileOf),
    mics: [{ id: '', label: AUTOMATIC_MICROPHONE }, ...tray.mics],
    micId: tray.micId ?? '',
    volume: Math.round(tray.volume * 100),
    setup: tray.setup,
  };
}

export function cardModel(view: OverlayHostView): CardModel | null {
  const { request, tray } = view;
  if (request === null) {
    return null;
  }
  return {
    theme: view.theme,
    position: view.prefs.position,
    mode: view.mode,
    title: request.title,
    why: request.why,
    accept: request.accept,
    decline: NOT_NOW,
    name: tray?.assistant ?? '',
  };
}

const GLOW_MODES = {
  bloom: 'listening',
  listening: 'listening',
  speaking: 'speaking',
  shimmer: 'thinking',
  off: 'off',
} as const;

export function glowModel(view: OverlayHostView, gpu: boolean): GlowModel {
  return {
    mode: GLOW_MODES[view.glow],
    bloom: view.glow === 'bloom',
    visible: view.mode === 'full' && view.prefs.glow && view.state !== 'hidden',
    still: view.reducedMotion || !gpu,
    theme: view.theme,
  };
}

export function restMs(state: OverlayHostView['state']): number {
  return state === 'thinking' ? 3000 : 8000;
}
