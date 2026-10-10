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

export const TV_APPS: readonly TvApp[] = [
  { name: 'Netflix', ids: ['3201907018807', '11101200001'] },
  { name: 'YouTube', ids: ['111299001912'] },
  { name: 'YouTube TV', ids: ['3201707014489'] },
  { name: 'Prime Video', ids: ['3201910019365', '3201512006785'] },
  { name: 'Disney+', ids: ['3201901017640', '3202009021709', '3202204027038'] },
  { name: 'Apple TV', ids: ['3201807016597'] },
  { name: 'Apple Music', ids: ['3201908019041'] },
  { name: 'Plex', ids: ['3201512006963'] },
  { name: 'Spotify', ids: ['3201606009684'] },
  { name: 'Max', ids: ['3202301029760'] },
  { name: 'Hulu', ids: ['3201601007625'] },
  { name: 'Paramount+', ids: ['3201710014981', '3202110025305'] },
  { name: 'Peacock', ids: ['3202006020991'] },
  { name: 'Twitch', ids: ['3202203026841'] },
  { name: 'Tubi', ids: ['3201504001965'] },
  { name: 'Pluto TV', ids: ['3201808016802'] },
  { name: 'Crunchyroll', ids: ['3202302030097'] },
  { name: 'DAZN', ids: ['3201806016390'] },
  { name: 'Xbox', ids: ['3202203026799'] },
  { name: 'GeForce NOW', ids: ['3202102023078'] },
  { name: 'SmartThings', ids: ['3201910019378', '3201710015016', '3202311033054'] },
  { name: 'Gallery', ids: ['3201710015037'] },
  { name: 'Browser', ids: ['org.tizen.browser', '3201907018784', '3202010022079'] },
];

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
