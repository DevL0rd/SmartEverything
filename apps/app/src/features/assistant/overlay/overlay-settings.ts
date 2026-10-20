import { createElement, type ReactNode } from 'react';
import { OVERLAY_PREFS, type OverlayPrefs } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { SelectRow, SwitchRow } from '../../../components/rows';
import type { SelectOption } from '../../../components/select-picker';
import type { SettingDefinition, SettingEnv } from '../../../settings/types';
import { localPref, setLocalPref, useLocalPref } from '../../../store/local-prefs';
import { ASSISTANT_GROUPS } from '../settings/settings-groups';
import { desktopBridge } from '../../../design/platform';
import { OverlayHelperRow } from './overlay-helper-row';
import { OverlayPermissionRow, OverlayResetPositionRow } from './overlay-permission-row';
import { MuteShortcutRow, TalkShortcutRow } from './overlay-shortcut-row';

export function useOverlayPrefs(): OverlayPrefs {
  return useLocalPref('overlay');
}

export function setOverlayPref<K extends keyof OverlayPrefs>(key: K, value: OverlayPrefs[K]): void {
  setLocalPref('overlay', { ...localPref('overlay'), [key]: value });
}

export function toggleCaptions(): void {
  setOverlayPref('captions', !localPref('overlay').captions);
}

type SwitchKey = 'enabled' | 'glow' | 'captions';

type ChoiceKey = 'position' | 'display' | 'whileSharing';

interface RowText {
  readonly id: string;
  readonly icon: IconName;
  readonly title: string;
  readonly subtitle?: string;
  readonly keywords: readonly string[];
  readonly visible: (env: SettingEnv) => boolean;
}

interface SwitchSpec extends RowText {
  readonly key: SwitchKey;
}

interface ChoiceSpec extends RowText {
  readonly key: ChoiceKey;
  readonly options: readonly SelectOption<string>[];
}

const NOT_WEB = (env: SettingEnv): boolean => env.platform !== 'web';
const DESKTOP = (env: SettingEnv): boolean => env.platform === 'desktop';
const ANDROID = (env: SettingEnv): boolean => env.platform === 'android';

export const OVERLAY_SWITCHES: readonly SwitchSpec[] = [
  {
    id: 'assistant.overlay',
    key: 'enabled',
    icon: 'sparkles',
    title: 'Show voice overlay',
    subtitle: 'A floating bar with call controls while you are away from the call.',
    keywords: ['overlay', 'voice bar', 'floating', 'bottom', 'assistant overlay', 'call controls'],
    visible: NOT_WEB,
  },
  {
    id: 'assistant.overlay-glow',
    key: 'glow',
    icon: 'sun',
    title: 'Edge glow',
    subtitle: 'A soft glow along the bottom of the screen that follows the voice.',
    keywords: ['overlay', 'glow', 'edge', 'animation'],
    visible: NOT_WEB,
  },
  {
    id: 'assistant.overlay-captions',
    key: 'captions',
    icon: 'messageCircle',
    title: 'Show what’s said',
    subtitle: 'Captions in the bar. Turn off to keep it private on shared screens.',
    keywords: ['overlay', 'captions', 'subtitles', 'transcript'],
    visible: NOT_WEB,
  },
];

export const OVERLAY_CHOICES: readonly ChoiceSpec[] = [
  {
    id: 'assistant.overlay-position',
    key: 'position',
    icon: 'grid',
    title: 'Position',
    keywords: ['overlay', 'position', 'bottom', 'left', 'right', 'centre'],
    visible: NOT_WEB,
    options: [
      { value: 'centre', label: 'Bottom centre' },
      { value: 'left', label: 'Bottom left' },
      { value: 'right', label: 'Bottom right' },
    ],
  },
  {
    id: 'assistant.overlay-display',
    key: 'display',
    icon: 'monitor',
    title: 'Show on',
    keywords: ['overlay', 'screen', 'display', 'monitor'],
    visible: DESKTOP,
    options: [
      { value: 'active', label: 'Active screen' },
      { value: 'primary', label: 'Primary screen' },
      { value: 'app', label: 'Screen with SmartEverything' },
    ],
  },
  {
    id: 'assistant.overlay-sharing',
    key: 'whileSharing',
    icon: 'screenShare',
    title: 'While sharing my whole screen',
    subtitle: 'The bar can stay visible in what you share. The tray menu and shortcuts still work.',
    keywords: ['overlay', 'sharing', 'screen share', 'hide', 'privacy'],
    visible: DESKTOP,
    options: [
      { value: 'small', label: 'Small bar' },
      { value: 'hide', label: 'Hide' },
    ],
  },
];

function PrefSwitch({ spec }: { readonly spec: SwitchSpec }): ReactNode {
  const prefs = useOverlayPrefs();
  return createElement(SwitchRow, {
    title: spec.title,
    ...(spec.subtitle === undefined ? {} : { subtitle: spec.subtitle }),
    icon: spec.icon,
    value: prefs[spec.key],
    onChange: (value: boolean) => {
      setOverlayPref(spec.key, value);
    },
  });
}

export function choiceValue(key: ChoiceKey, value: string): OverlayPrefs[ChoiceKey] | null {
  const parsed = OVERLAY_PREFS.shape[key].safeParse(value);
  return parsed.success ? parsed.data : null;
}

function PrefChoice({ spec }: { readonly spec: ChoiceSpec }): ReactNode {
  const prefs = useOverlayPrefs();
  return createElement(SelectRow<string>, {
    title: spec.title,
    ...(spec.subtitle === undefined ? {} : { subtitle: spec.subtitle }),
    icon: spec.icon,
    options: spec.options,
    value: prefs[spec.key],
    onChange: (value: string) => {
      const next = choiceValue(spec.key, value);
      if (next !== null) {
        setOverlayPref(spec.key, next);
      }
    },
  });
}

const BASE = {
  page: 'assistant',
  section: ASSISTANT_GROUPS.conversation,
  scope: 'device-local',
  control: 'custom',
  row: true,
} as const;

function definition(
  text: RowText,
  render: () => ReactNode,
  visible: (env: SettingEnv) => boolean = text.visible,
): SettingDefinition {
  return { ...BASE, id: text.id, title: text.title, keywords: text.keywords, visible, render };
}

const SHORTCUT_KEYWORDS = ['shortcut', 'keyboard', 'hotkey', 'talk to the ai', 'assistant', 'hey'];

export const OVERLAY_SETTINGS: readonly SettingDefinition[] = [
  ...OVERLAY_SWITCHES.map((spec) => definition(spec, () => createElement(PrefSwitch, { spec }))),
  ...OVERLAY_CHOICES.map((spec) => definition(spec, () => createElement(PrefChoice, { spec }))),
  {
    ...BASE,
    id: 'assistant.overlay-permission',
    title: 'Show call controls over other apps',
    keywords: ['overlay', 'permission', 'display over other apps', 'floating', 'call controls'],
    visible: ANDROID,
    render: () => createElement(OverlayPermissionRow),
  },
  {
    ...BASE,
    id: 'assistant.overlay-reset-position',
    title: 'Reset overlay position',
    keywords: ['overlay', 'position', 'reset', 'move', 'drag', 'bottom', 'home'],
    visible: ANDROID,
    render: () => createElement(OverlayResetPositionRow),
  },
  {
    ...BASE,
    id: 'assistant.overlay-helper',
    title: 'Overlay window helper',
    keywords: ['overlay', 'kde', 'helper', 'kwin', 'window', 'konveyor'],
    visible: (env) => DESKTOP(env) && desktopBridge()?.platform === 'linux',
    render: () => createElement(OverlayHelperRow),
  },
  {
    ...BASE,
    id: 'assistant.talk-shortcut',
    title: 'Talk to the AI shortcut',
    keywords: SHORTCUT_KEYWORDS,
    visible: DESKTOP,
    render: () => createElement(TalkShortcutRow),
  },
  {
    ...BASE,
    id: 'assistant.mute-shortcut',
    title: 'Mute the AI call shortcut',
    keywords: [...SHORTCUT_KEYWORDS, 'mute'],
    visible: DESKTOP,
    render: () => createElement(MuteShortcutRow),
  },
];
