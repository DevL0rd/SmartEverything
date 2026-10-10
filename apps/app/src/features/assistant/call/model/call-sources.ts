import type {
  AppSightSource,
  CallCapabilities,
  DesktopCaptureMode,
  DesktopCaptureSource,
  SightFacing,
} from '@smarteverything/domain';
import type { IconName } from '../../../../components/icon';
import type { AppPlatform } from '../../../../design/platform';
import type { CameraEntry } from '../../../cameras';
import type { EngineCapabilities, SightStart } from '../engine/call-engine';

export type SourceGroup = 'Phone' | 'Camera' | 'Home' | 'Screens' | 'Windows' | 'Computer';

export type SourcePick =
  | { readonly kind: 'app'; readonly start: SightStart; readonly label: string }
  | { readonly kind: 'home'; readonly cameraId: string; readonly label: string }
  | {
      readonly kind: 'desktop';
      readonly source: 'desktop_screen' | 'desktop_window';
      readonly captureId: string | null;
      readonly label: string;
    };

export interface SourceChoice {
  readonly key: string;
  readonly group: SourceGroup;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: IconName;
  readonly thumbnail: string | null;
  readonly unavailable: string | null;
  readonly pick: SourcePick;
}

export type SourceScope = 'all' | 'home' | 'screen' | 'window';

export interface SourceInput {
  readonly platform: AppPlatform;
  readonly engine: EngineCapabilities;
  readonly hub: CallCapabilities | null;
  readonly cameras: readonly CameraEntry[];
  readonly capture: readonly DesktopCaptureSource[];
  readonly captureMode: DesktopCaptureMode | null;
}

const GROUP_ORDER: readonly SourceGroup[] = [
  'Phone',
  'Camera',
  'Home',
  'Screens',
  'Windows',
  'Computer',
];

function reasonOf(source: AppSightSource, input: SourceInput): string | null {
  const engine = input.engine.sight[source];
  if (engine !== null) {
    return engine;
  }
  return input.hub !== null && !input.hub.sight.includes(source)
    ? 'Update your home server to share this'
    : null;
}

function facingChoice(facing: SightFacing, input: SourceInput): SourceChoice {
  const back = facing === 'back';
  return {
    key: `camera:${facing}`,
    group: 'Phone',
    title: back ? 'Back camera' : 'Front camera',
    subtitle: 'Phone camera',
    icon: 'camera',
    thumbnail: null,
    unavailable: reasonOf('phone_camera', input),
    pick: {
      kind: 'app',
      start: { source: 'phone_camera', facing },
      label: back ? 'Back camera' : 'Front camera',
    },
  };
}

function phoneChoices(input: SourceInput): readonly SourceChoice[] {
  return [
    facingChoice('back', input),
    facingChoice('front', input),
    {
      key: 'phone-screen',
      group: 'Phone',
      title: 'Phone screen',
      subtitle: 'What is on screen now',
      icon: 'smartphone',
      thumbnail: null,
      unavailable: reasonOf('phone_screen', input),
      pick: { kind: 'app', start: { source: 'phone_screen' }, label: 'Phone screen' },
    },
  ];
}

function sizeText(source: DesktopCaptureSource): string {
  return source.width === null || source.height === null
    ? source.kind === 'screen'
      ? 'Screen'
      : 'Window'
    : `${String(source.width)} × ${String(source.height)}${source.primary ? ' · primary' : ''}`;
}

function captureChoice(source: DesktopCaptureSource, input: SourceInput): SourceChoice {
  const screen = source.kind === 'screen';
  const app = screen ? 'desktop_screen' : 'desktop_window';
  return {
    key: `capture:${source.id}`,
    group: screen ? 'Screens' : 'Windows',
    title: source.title,
    subtitle: sizeText(source),
    icon: screen ? 'monitor' : 'appWindow',
    thumbnail: source.thumbnail,
    unavailable: reasonOf(app, input),
    pick: { kind: 'desktop', source: app, captureId: source.id, label: source.title },
  };
}

function systemPickerChoice(input: SourceInput): SourceChoice {
  const portal = input.captureMode === 'portal';
  return {
    key: 'capture:system',
    group: 'Computer',
    title: 'Screen or window',
    subtitle: portal ? 'Choose in the system dialog' : 'Choose in the browser',
    icon: 'monitor',
    thumbnail: null,
    unavailable: reasonOf('desktop_screen', input),
    pick: { kind: 'desktop', source: 'desktop_screen', captureId: null, label: 'Screen' },
  };
}

function computerChoices(input: SourceInput): readonly SourceChoice[] {
  const camera: SourceChoice = {
    key: 'camera:external',
    group: 'Camera',
    title: 'Camera',
    subtitle: 'Webcam',
    icon: 'camera',
    thumbnail: null,
    unavailable: reasonOf('phone_camera', input),
    pick: { kind: 'app', start: { source: 'phone_camera', facing: 'external' }, label: 'Camera' },
  };
  const screens =
    input.captureMode === 'picker'
      ? input.capture.map((source) => captureChoice(source, input))
      : [systemPickerChoice(input)];
  return [camera, ...screens];
}

function homeChoices(input: SourceInput): readonly SourceChoice[] {
  return input.cameras
    .filter((entry) => entry.camera !== null)
    .map((entry) => ({
      key: `home:${entry.device.id}`,
      group: 'Home' as const,
      title: entry.name,
      subtitle: entry.room === null ? 'Home camera · live view' : `${entry.room} · live view`,
      icon: 'camera' as const,
      thumbnail: null,
      unavailable:
        input.hub !== null && !input.hub.sight.includes('home_camera')
          ? 'Update your home server to share this'
          : entry.device.online
            ? null
            : 'Offline',
      pick: { kind: 'home' as const, cameraId: entry.device.id, label: entry.name },
    }));
}

function inScope(choice: SourceChoice, scope: SourceScope): boolean {
  switch (scope) {
    case 'all':
      return true;
    case 'home':
      return choice.group === 'Home';
    case 'window':
      return choice.group === 'Windows';
    case 'screen':
      return (
        choice.group === 'Screens' ||
        choice.group === 'Windows' ||
        choice.group === 'Computer' ||
        choice.key === 'phone-screen'
      );
  }
}

export function sourceChoicesOf(input: SourceInput, scope: SourceScope): readonly SourceChoice[] {
  const device = input.platform === 'android' ? phoneChoices(input) : computerChoices(input);
  const all = [...device, ...homeChoices(input)].filter((choice) => inScope(choice, scope));
  return GROUP_ORDER.flatMap((group) => all.filter((choice) => choice.group === group));
}

export function groupsOf(
  choices: readonly SourceChoice[],
): readonly { readonly group: SourceGroup; readonly choices: readonly SourceChoice[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    choices: choices.filter((choice) => choice.group === group),
  })).filter((entry) => entry.choices.length > 0);
}
