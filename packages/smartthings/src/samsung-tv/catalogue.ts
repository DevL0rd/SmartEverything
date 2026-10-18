import { TV_APP_CATALOGUE } from '@smarteverything/domain';

export const TV_KEYS = [
  'KEY_POWER',
  'KEY_POWEROFF',
  'KEY_HOME',
  'KEY_MENU',
  'KEY_SOURCE',
  'KEY_GUIDE',
  'KEY_TOOLS',
  'KEY_INFO',
  'KEY_UP',
  'KEY_DOWN',
  'KEY_LEFT',
  'KEY_RIGHT',
  'KEY_ENTER',
  'KEY_RETURN',
  'KEY_CH_LIST',
  'KEY_CHUP',
  'KEY_CHDOWN',
  'KEY_PRECH',
  'KEY_VOLUP',
  'KEY_VOLDOWN',
  'KEY_MUTE',
  'KEY_0',
  'KEY_1',
  'KEY_2',
  'KEY_3',
  'KEY_4',
  'KEY_5',
  'KEY_6',
  'KEY_7',
  'KEY_8',
  'KEY_9',
  'KEY_RED',
  'KEY_GREEN',
  'KEY_YELLOW',
  'KEY_BLUE',
  'KEY_PLAY',
  'KEY_PAUSE',
  'KEY_STOP',
  'KEY_FF',
  'KEY_REWIND',
  'KEY_REC',
  'KEY_TV',
  'KEY_HDMI',
  'KEY_HDMI1',
  'KEY_HDMI2',
  'KEY_HDMI3',
  'KEY_HDMI4',
  'KEY_CAPTION',
  'KEY_SUB_TITLE',
  'KEY_PICTURE_SIZE',
  'KEY_SLEEP',
  'KEY_APP_LIST',
] as const;

export type TvKey = (typeof TV_KEYS)[number];

export interface TvApp {
  readonly name: string;
  readonly ids: readonly [string, ...string[]];
}

export const TV_APPS: readonly TvApp[] = TV_APP_CATALOGUE.flatMap(
  ({ name, launchIds }): readonly TvApp[] => {
    const [first, ...rest] = launchIds;
    return first === undefined ? [] : [{ name, ids: [first, ...rest] }];
  },
);

export const TV_APP_NAMES: readonly string[] = TV_APPS.map((app) => app.name);

export function tvAppNamed(name: unknown): TvApp | undefined {
  return TV_APPS.find((app) => app.name === name);
}

export const TV_INPUT_SOURCES = {
  tv: 'KEY_TV',
  hdmi1: 'KEY_HDMI1',
  hdmi2: 'KEY_HDMI2',
  hdmi3: 'KEY_HDMI3',
  hdmi4: 'KEY_HDMI4',
} as const satisfies Record<string, TvKey>;
