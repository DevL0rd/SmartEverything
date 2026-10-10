import type { AppSightSource } from '@smarteverything/domain';
import type { IconName } from '../../../../components/icon';
import type { EngineCapabilities } from '../engine/call-engine';
import type { CallView } from '../call-state';
import { isScreenSource } from './call-copy';

export type ControlLook = 'tonal' | 'selected' | 'end';

export interface ControlSpec {
  readonly key: string;
  readonly icon: IconName;
  readonly text: string;
  readonly label: string;
  readonly look: ControlLook;
  readonly dot?: boolean;
  readonly disabled?: boolean;
  readonly expanded?: boolean;
  readonly shortcut?: string;
  readonly onPress: () => void;
}

export const OLD_HUB_REASON = 'Update your home server to share video';

export const RECONNECTING_REASON = 'Reconnecting…';

export interface ControlReasons {
  readonly camera: string | null;
  readonly share: string | null;
  readonly notice: string | null;
}

export interface CallControlHandlers {
  readonly onMute: () => void;
  readonly onCamera: () => void;
  readonly onShare: () => void;
  readonly onSettings: () => void;
  readonly onEnd: () => void;
}

const SHARE_SOURCES: readonly AppSightSource[] = [
  'phone_screen',
  'desktop_screen',
  'desktop_window',
];

function firstReason(caps: EngineCapabilities, sources: readonly AppSightSource[]): string | null {
  const reasons = sources.map((source) => caps.sight[source]);
  return reasons.every((reason) => reason !== null) ? (reasons[0] ?? null) : null;
}

export function reasonsOf(call: CallView, caps: EngineCapabilities): ControlReasons {
  if (call.phase === 'reconnecting') {
    return { camera: RECONNECTING_REASON, share: RECONNECTING_REASON, notice: null };
  }
  if (call.capabilities === null && call.phase !== 'connecting' && call.phase !== 'idle') {
    return { camera: OLD_HUB_REASON, share: OLD_HUB_REASON, notice: OLD_HUB_REASON };
  }
  const camera = firstReason(caps, ['phone_camera']);
  const share = firstReason(caps, SHARE_SOURCES);
  return { camera, share, notice: camera ?? share };
}

export function cameraOnOf(call: CallView): boolean {
  return (
    call.video.camera === 'on' || call.video.camera === 'paused' || call.video.camera === 'starting'
  );
}

export function sharingOf(call: CallView): boolean {
  return (
    call.video.screen !== 'off' ||
    (call.sight !== null &&
      (isScreenSource(call.sight.source) || call.sight.source === 'home_camera'))
  );
}

function cameraStateText(call: CallView): string {
  if (!cameraOnOf(call)) {
    return 'off';
  }
  const paused = call.video.camera === 'paused' ? ', paused' : '';
  return `on, ${call.video.facing} camera${paused}`;
}

export interface ControlsInput {
  readonly call: CallView;
  readonly reasons: ControlReasons;
  readonly handlers: CallControlHandlers;
  readonly settingsOpen: boolean;
  readonly pointer: boolean;
}

interface Shortcut {
  readonly shortcut?: string;
}

function shortcutOf(pointer: boolean, key: string): Shortcut {
  return pointer ? { shortcut: key } : {};
}

function muteControl({ call, handlers, pointer }: ControlsInput): ControlSpec {
  return {
    key: 'mute',
    icon: call.muted ? 'micOff' : 'mic',
    text: call.muted ? 'Unmute' : 'Mute',
    label: call.muted ? 'Unmute microphone' : 'Mute microphone',
    look: call.muted ? 'selected' : 'tonal',
    onPress: handlers.onMute,
    ...shortcutOf(pointer, 'M'),
  };
}

function cameraControl({ call, reasons, handlers, pointer }: ControlsInput): ControlSpec {
  const camera = cameraOnOf(call);
  return {
    key: 'camera',
    icon: camera ? 'camera' : 'cameraOff',
    text: 'Camera',
    label: `Camera, ${cameraStateText(call)}`,
    look: camera ? 'selected' : 'tonal',
    dot: camera,
    disabled: reasons.camera !== null,
    expanded: camera,
    onPress: handlers.onCamera,
    ...shortcutOf(pointer, 'V'),
  };
}

function shareControl({ call, reasons, handlers, pointer }: ControlsInput): ControlSpec {
  const sharing = sharingOf(call);
  return {
    key: 'share',
    icon: 'screenShare',
    text: sharing ? 'Sharing' : 'Share',
    label: sharing ? 'Sharing, open share options' : 'Share screen',
    look: sharing ? 'selected' : 'tonal',
    dot: sharing,
    disabled: reasons.share !== null,
    expanded: true,
    onPress: handlers.onShare,
    ...shortcutOf(pointer, 'S'),
  };
}

function settingsControl({ settingsOpen, handlers, pointer }: ControlsInput): ControlSpec {
  return {
    key: 'settings',
    icon: 'settings',
    text: 'Settings',
    label: 'Call settings',
    look: settingsOpen ? 'selected' : 'tonal',
    expanded: settingsOpen,
    onPress: handlers.onSettings,
    ...shortcutOf(pointer, ','),
  };
}

export function controlsOf(input: ControlsInput): readonly ControlSpec[] {
  return [
    muteControl(input),
    cameraControl(input),
    shareControl(input),
    settingsControl(input),
    {
      key: 'end',
      icon: 'phoneOff',
      text: 'End',
      label: 'End call',
      look: 'end',
      onPress: input.handlers.onEnd,
    },
  ];
}
