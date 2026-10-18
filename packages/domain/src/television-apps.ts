export const APP_TONES = [
  'viz-1',
  'viz-2',
  'viz-3',
  'viz-4',
  'viz-5',
  'viz-6',
  'viz-7',
  'viz-8',
] as const;

export type AppTone = (typeof APP_TONES)[number];

const UNKNOWN_TONE: AppTone = 'viz-8';

export interface TvAppEntry {
  readonly name: string;
  readonly tone: AppTone;
  readonly launchIds: readonly string[];
  readonly packageIds: readonly string[];
}

export const TV_APP_CATALOGUE: readonly TvAppEntry[] = [
  {
    name: 'Netflix',
    tone: 'viz-1',
    launchIds: ['3201907018807', '11101200001'],
    packageIds: ['org.tizen.netflix-app'],
  },
  {
    name: 'YouTube',
    tone: 'viz-2',
    launchIds: ['111299001912'],
    packageIds: ['9Ur5IzDKqV.TizenYouTube'],
  },
  { name: 'YouTube TV', tone: 'viz-3', launchIds: ['3201707014489'], packageIds: [] },
  {
    name: 'Prime Video',
    tone: 'viz-4',
    launchIds: ['3201910019365', '3201512006785'],
    packageIds: ['org.tizen.ignition'],
  },
  {
    name: 'Disney+',
    tone: 'viz-5',
    launchIds: ['3201901017640', '3202009021709', '3202204027038'],
    packageIds: ['MCmYXNxgcu.DisneyPlus'],
  },
  { name: 'Apple TV', tone: 'viz-6', launchIds: ['3201807016597'], packageIds: [] },
  { name: 'Apple Music', tone: 'viz-7', launchIds: ['3201908019041'], packageIds: [] },
  { name: 'Plex', tone: 'viz-8', launchIds: ['3201512006963'], packageIds: ['kIciSQlYEM.plex'] },
  {
    name: 'Spotify',
    tone: 'viz-1',
    launchIds: ['3201606009684'],
    packageIds: ['rJeHak5zRg.Spotify'],
  },
  { name: 'Max', tone: 'viz-2', launchIds: ['3202301029760'], packageIds: [] },
  { name: 'Hulu', tone: 'viz-3', launchIds: ['3201601007625'], packageIds: [] },
  {
    name: 'Paramount+',
    tone: 'viz-4',
    launchIds: ['3201710014981', '3202110025305'],
    packageIds: [],
  },
  { name: 'Peacock', tone: 'viz-5', launchIds: ['3202006020991'], packageIds: [] },
  { name: 'Twitch', tone: 'viz-6', launchIds: ['3202203026841'], packageIds: [] },
  { name: 'Tubi', tone: 'viz-7', launchIds: ['3201504001965'], packageIds: [] },
  { name: 'Pluto TV', tone: 'viz-8', launchIds: ['3201808016802'], packageIds: [] },
  { name: 'Crunchyroll', tone: 'viz-1', launchIds: ['3202302030097'], packageIds: [] },
  { name: 'DAZN', tone: 'viz-2', launchIds: ['3201806016390'], packageIds: [] },
  { name: 'Xbox', tone: 'viz-3', launchIds: ['3202203026799'], packageIds: [] },
  { name: 'GeForce NOW', tone: 'viz-4', launchIds: ['3202102023078'], packageIds: [] },
  {
    name: 'SmartThings',
    tone: 'viz-5',
    launchIds: ['3201910019378', '3201710015016', '3202311033054'],
    packageIds: [],
  },
  { name: 'Gallery', tone: 'viz-6', launchIds: ['3201710015037'], packageIds: [] },
  {
    name: 'Browser',
    tone: 'viz-7',
    launchIds: ['org.tizen.browser', '3201907018784', '3202010022079'],
    packageIds: [],
  },
  { name: 'Home screen', tone: 'viz-8', launchIds: [], packageIds: ['com.samsung.tv.csfs'] },
];

export interface CurrentApp {
  readonly id: string;
  readonly name: string;
  readonly tone: AppTone;
  readonly monogram: string;
}

function monogramOf(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter((word) => word !== '');
  const text = words.length > 1 ? words.map((word) => word.charAt(0)).join('') : words.join('');
  return text.slice(0, 2).toUpperCase();
}

const KNOWN_APPS: ReadonlyMap<string, CurrentApp> = new Map(
  TV_APP_CATALOGUE.flatMap((entry) =>
    [...entry.launchIds, ...entry.packageIds].map((id): [string, CurrentApp] => [
      id,
      { id, name: entry.name, tone: entry.tone, monogram: monogramOf(entry.name) },
    ]),
  ),
);

function humanised(id: string): string {
  const words = id
    .slice(id.lastIndexOf('.') + 1)
    .replace(/^Tizen(?=[A-Z])/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter((word) => word !== '')
    .join(' ');
  return words === '' ? id : words.charAt(0).toUpperCase() + words.slice(1);
}

export function currentApp(value: string | null | undefined): CurrentApp | null {
  if (value === null || value === undefined || value.trim() === '') {
    return null;
  }
  const id = value.trim();
  const known = KNOWN_APPS.get(id);
  if (known !== undefined) {
    return known;
  }
  const name = humanised(id);
  return { id, name, tone: UNKNOWN_TONE, monogram: monogramOf(name) };
}
