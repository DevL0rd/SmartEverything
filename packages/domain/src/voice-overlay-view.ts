import type { SightSource } from './call-sight';
import {
  OVERLAY_COPY,
  OVERLAY_ENDED_MS,
  OVERLAY_ERROR_MS,
  OVERLAY_ERROR_RELEASE_MS,
  OVERLAY_SUPERSEDED_MS,
  OVERLAY_WAKE_LINK_MS,
  overlayDuration,
  type OverlayCall,
  type OverlayControl,
  type OverlayInput,
  type OverlayRequest,
  type OverlayState,
  type OverlayTile,
  type OverlayTileId,
  type OverlayTray,
  type OverlayView,
} from './voice-overlay';
import { chipOf, setupOf } from './voice-overlay-setup';

type OverlayMode = OverlayView['mode'];

export const OVERLAY_HIDDEN: OverlayView = {
  state: 'hidden',
  mode: 'full',
  status: '',
  detail: null,
  caption: null,
  orb: 'idle',
  level: null,
  glow: 'off',
  controls: [],
  muted: false,
  speaker: null,
  camera: 'off',
  tray: null,
  chip: null,
  request: null,
  changesAt: null,
};

const LIVE_STATES: readonly OverlayState[] = [
  'wake',
  'listening',
  'thinking',
  'speaking',
  'reconnecting',
];

const SEE_WHAT: Readonly<Record<SightSource, { readonly what: string; readonly accept: string }>> =
  {
    desktop_screen: { what: 'your screen', accept: 'Share screen' },
    phone_screen: { what: 'your screen', accept: 'Share screen' },
    desktop_window: { what: 'a window', accept: 'Share a window' },
    phone_camera: { what: 'your camera', accept: 'Turn camera on' },
    home_camera: { what: 'a home camera', accept: 'Show a home camera' },
  };

function flat(text: string | null): string | null {
  if (text === null) return null;
  const value = text.replace(/\s+/g, ' ').trim();
  return value === '' ? null : value;
}

function view(state: OverlayState, fields: Partial<OverlayView>): OverlayView {
  return { ...OVERLAY_HIDDEN, state, ...fields };
}

function shown(input: OverlayInput): boolean {
  if (!input.prefs.enabled) return false;
  const { surface } = input;
  if (surface.main === 'call') return false;
  if (surface.platform === 'phone') return true;
  const screenShared = surface.inShare && input.call?.sharing?.kind === 'screen';
  return !(screenShared && input.prefs.whileSharing === 'hide');
}

function errorHideAt(from: number, input: OverlayInput): number | null {
  const { hold } = input;
  if (hold.active) return null;
  const released = hold.endedAt === null ? from : hold.endedAt + OVERLAY_ERROR_RELEASE_MS;
  return Math.max(from, released);
}

interface ErrorCopy {
  readonly status: string;
  readonly caption: string | null;
  readonly retry: OverlayControl;
}

function errorView(copy: ErrorCopy, input: OverlayInput, from: number): OverlayView {
  const changesAt = errorHideAt(from, input);
  if (changesAt !== null && input.now >= changesAt) return OVERLAY_HIDDEN;
  const { status, caption, retry } = copy;
  return view('error', { status, caption, controls: [retry, 'close'], changesAt });
}

function problemView(call: OverlayCall, input: OverlayInput): OverlayView | null {
  const { problem } = call;
  if (problem === null) return null;
  const microphone = problem.fix === 'microphone';
  const copy: ErrorCopy = {
    status: microphone ? OVERLAY_COPY.microphoneBlocked : OVERLAY_COPY.unreachable,
    caption: flat(problem.text),
    retry: microphone ? 'fix' : 'retry',
  };
  return errorView(copy, input, problem.at + OVERLAY_ERROR_MS);
}

function supersededView(input: OverlayInput): OverlayView | null {
  const { superseded, now } = input;
  if (superseded === null) return null;
  const changesAt = superseded.at + OVERLAY_SUPERSEDED_MS;
  if (now >= changesAt) return null;
  return view('superseded', { status: `${OVERLAY_COPY.answeredBy} ${superseded.by}`, changesAt });
}

function endedView(call: OverlayCall, now: number): OverlayView {
  if (call.endedAt === null) return OVERLAY_HIDDEN;
  const changesAt = call.endedAt + OVERLAY_ENDED_MS;
  if (now >= changesAt) return OVERLAY_HIDDEN;
  const caption = overlayDuration(call.startedAt, call.endedAt);
  return view('ended', { status: OVERLAY_COPY.ended, caption, changesAt });
}

function listeningView(call: OverlayCall, captions: boolean): OverlayView {
  const { muted } = call;
  return view('listening', {
    status: muted ? OVERLAY_COPY.muted : OVERLAY_COPY.listening,
    caption: captions ? flat(call.heard) : null,
    orb: 'listening',
    level: muted ? null : 'input',
    glow: 'listening',
    muted,
  });
}

function thinkingView(call: OverlayCall, captions: boolean): OverlayView {
  return view('thinking', {
    status: OVERLAY_COPY.thinking,
    caption: captions ? (flat(call.tool) ?? flat(call.heard)) : null,
    orb: 'thinking',
    glow: 'shimmer',
    muted: call.muted,
  });
}

function speakingView(call: OverlayCall, captions: boolean): OverlayView {
  return view('speaking', {
    status: OVERLAY_COPY.speaking,
    caption: captions ? flat(call.said) : null,
    orb: 'speaking',
    level: 'output',
    glow: 'speaking',
    muted: call.muted,
  });
}

function liveView(call: OverlayCall, captions: boolean): OverlayView | null {
  switch (call.phase) {
    case 'connecting':
    case 'listening':
      return listeningView(call, captions);
    case 'thinking':
      return thinkingView(call, captions);
    case 'speaking':
      return speakingView(call, captions);
    case 'reconnecting':
      return view('reconnecting', { status: OVERLAY_COPY.reconnecting, muted: call.muted });
    case 'idle':
    case 'ended':
      return null;
  }
}

function wakeView(input: OverlayInput): OverlayView {
  const { wake, now, prefs } = input;
  if (wake === null) return OVERLAY_HIDDEN;
  const linkBy = wake.at + OVERLAY_WAKE_LINK_MS;
  if (now >= linkBy) {
    const copy: ErrorCopy = {
      status: OVERLAY_COPY.unreachable,
      caption: OVERLAY_COPY.linkFailed,
      retry: 'retry',
    };
    return errorView(copy, input, linkBy + OVERLAY_ERROR_MS);
  }
  return view('wake', {
    status: wake.muted ? OVERLAY_COPY.muted : OVERLAY_COPY.listening,
    caption: prefs.captions ? (flat(wake.words) ?? OVERLAY_COPY.wakeCaption) : null,
    orb: 'listening',
    level: wake.muted ? null : 'input',
    glow: 'bloom',
    muted: wake.muted,
    controls: ['mute', 'end'],
    changesAt: linkBy,
  });
}

function stateView(input: OverlayInput): OverlayView {
  const superseded = supersededView(input);
  if (superseded !== null) return superseded;
  const { call } = input;
  if (call !== null) {
    const problem = problemView(call, input);
    if (problem !== null) return problem;
    if (call.phase === 'ended') return endedView(call, input.now);
    const live = liveView(call, input.prefs.captions);
    if (live !== null) return live;
  }
  return wakeView(input);
}

function modeOf(input: OverlayInput, call: OverlayCall): OverlayMode {
  const { surface } = input;
  if (surface.platform === 'desktop' && call.sharing !== null) return 'share';
  return surface.main === 'other' ? 'compact' : 'full';
}

function cameraOn(call: OverlayCall): boolean {
  return call.camera === 'on' || call.camera === 'paused' || call.camera === 'starting';
}

function phoneControls(state: OverlayState, call: OverlayCall): OverlayControl[] {
  const reconnecting = state === 'reconnecting';
  const controls: OverlayControl[] = reconnecting ? [] : ['mute'];
  if (state === 'speaking') controls.push('interrupt');
  if (call.sharing !== null) controls.push('stop_share');
  if (!reconnecting) controls.push('more');
  return [...controls, 'end'];
}

function controlsOf(
  input: OverlayInput,
  call: OverlayCall,
  state: OverlayState,
  mode: OverlayMode,
): OverlayControl[] {
  if (call.hosted === true) return state === 'reconnecting' ? ['end'] : ['mute', 'end'];
  return input.surface.platform === 'phone'
    ? phoneControls(state, call)
    : desktopControls(state, mode);
}

function desktopControls(state: OverlayState, mode: OverlayMode): OverlayControl[] {
  const speaking: OverlayControl[] = state === 'speaking' ? ['interrupt'] : [];
  const middle: Readonly<Record<OverlayMode, OverlayControl[]>> = {
    full: state === 'reconnecting' ? [] : ['camera', 'share'],
    share: ['stop_share'],
    compact: [],
  };
  const mute: OverlayControl[] = state === 'reconnecting' ? [] : ['mute'];
  return [...mute, ...speaking, ...middle[mode], 'more', 'end'];
}

function detailOf(call: OverlayCall): string | null {
  const { sharing, camera } = call;
  if (sharing !== null) {
    if (sharing.kind === 'screen') return OVERLAY_COPY.sharingScreen;
    return `${OVERLAY_COPY.sharingWindow} ${sharing.label ?? 'a window'}`;
  }
  if (camera === 'on' || camera === 'starting') return OVERLAY_COPY.cameraOn;
  return camera === 'paused' ? OVERLAY_COPY.cameraPaused : null;
}

function tile(
  id: OverlayTileId,
  label: string,
  pressed: boolean | null,
  disabled: string | null,
): OverlayTile {
  return { id, label, pressed, disabled, critical: id === 'stop_share' };
}

function phoneTilesOf(call: OverlayCall, state: OverlayState, captions: boolean): OverlayTile[] {
  const { camera, share } = call.reasons;
  const on = cameraOn(call);
  const talking = state === 'speaking' ? null : 'Only while the assistant is talking';
  const speaker = call.speaker === null ? [] : [tile('speaker', 'Speaker', call.speaker, null)];
  return [
    tile('camera', 'Camera', on, camera),
    tile(
      'pause_video',
      'Pause video',
      call.camera === 'paused',
      camera ?? (on ? null : 'Turn the camera on first'),
    ),
    call.sharing === null
      ? tile('share_screen', 'Share screen', null, share)
      : tile('stop_share', 'Stop sharing', null, null),
    tile('home_camera', 'Home camera', null, share),
    ...speaker,
    tile('interrupt', 'Stop talking', null, talking),
    tile('captions', 'Captions', captions, null),
    tile('settings', 'Call settings', null, null),
  ];
}

function tilesOf(call: OverlayCall, state: OverlayState, captions: boolean): OverlayTile[] {
  const { camera, share } = call.reasons;
  const on = cameraOn(call);
  const sharing = call.sharing !== null;
  const talking = state === 'speaking' ? null : 'Only while the assistant is talking';
  return [
    tile('camera', 'Camera', on, camera),
    tile(
      'pause_video',
      'Pause video',
      call.camera === 'paused',
      camera ?? (on ? null : 'Turn the camera on first'),
    ),
    tile('show_this', 'Show this', null, share),
    sharing
      ? tile('stop_share', 'Stop sharing', null, null)
      : tile('share_screen', 'Share screen', null, share),
    tile('share_window', sharing ? 'Share another' : 'Share a window', null, share),
    tile('home_camera', 'Home camera', null, share),
    tile('interrupt', 'Stop talking', null, talking),
    tile('captions', 'Captions', captions, null),
    tile('settings', 'Call settings', null, null),
  ];
}

function trayOf(input: OverlayInput, call: OverlayCall, state: OverlayState): OverlayTray {
  const { audio } = input;
  const tiles = input.surface.platform === 'phone' ? phoneTilesOf : tilesOf;
  return {
    assistant: call.assistant,
    chat: call.chat,
    elapsedFrom: call.startedAt,
    tiles: tiles(call, state, input.prefs.captions),
    setup: setupOf(input.voice),
    mics: audio.mics,
    micId: audio.micId,
    volume: audio.volume,
  };
}

function requestOf(call: OverlayCall): OverlayRequest | null {
  const { request } = call;
  if (request === null) return null;
  const see = SEE_WHAT[request.what];
  return {
    title: `${call.assistant} ${OVERLAY_COPY.wantsToSee} ${see.what}`,
    why: request.why,
    accept: see.accept,
    expiresAt: request.expiresAt,
  };
}

function withCall(base: OverlayView, input: OverlayInput, call: OverlayCall): OverlayView {
  const phone = input.surface.platform === 'phone';
  const mode = modeOf(input, call);
  const glowOn = mode === 'full' && !(phone && call.sharing !== null);
  const hosted = call.hosted === true;
  return {
    ...base,
    mode,
    detail: detailOf(call),
    glow: glowOn ? base.glow : 'off',
    controls: controlsOf(input, call, base.state, mode),
    speaker: call.speaker,
    camera: call.camera,
    tray: hosted ? null : trayOf(input, call, base.state),
    chip: hosted ? null : chipOf(input.voice),
    request: hosted ? null : requestOf(call),
  };
}

function compactOf(base: OverlayView, input: OverlayInput): OverlayView {
  const compact = input.surface.main === 'other';
  return compact ? { ...base, mode: 'compact', glow: 'off' } : base;
}

export function overlayView(input: OverlayInput): OverlayView {
  if (!shown(input)) return OVERLAY_HIDDEN;
  const base = stateView(input);
  if (base.state === 'hidden') return OVERLAY_HIDDEN;
  const { call } = input;
  const live = LIVE_STATES.includes(base.state) && base.state !== 'wake';
  if (live && call !== null) return withCall(base, input, call);
  return compactOf(base, input);
}
