import { PROVIDERS, type Provider } from './devices';
import type { XIAOMI_REGIONS } from './hub-commands';

export type XiaomiRegion = (typeof XIAOMI_REGIONS)[number];

export const XIAOMI_REGION_LABELS: Readonly<Record<XiaomiRegion, string>> = {
  cn: 'Mainland China',
  de: 'Europe',
  i2: 'India',
  ru: 'Russia',
  sg: 'Singapore and other regions',
  us: 'United States',
};

const CHINA_ZONES: ReadonlySet<string> = new Set([
  'Asia/Shanghai',
  'Asia/Chongqing',
  'Asia/Chungking',
  'Asia/Harbin',
  'Asia/Urumqi',
  'Asia/Kashgar',
  'PRC',
]);

const RUSSIAN_ZONES =
  /^(Europe\/(Moscow|Kaliningrad|Samara|Volgograd|Kirov|Ulyanovsk|Astrakhan|Saratov)|Asia\/(Yekaterinburg|Omsk|Novosibirsk|Barnaul|Tomsk|Novokuznetsk|Krasnoyarsk|Irkutsk|Chita|Yakutsk|Khandyga|Vladivostok|Ust-Nera|Magadan|Sakhalin|Srednekolymsk|Kamchatka|Anadyr))$/;

const ZONE_REGIONS: readonly (readonly [RegExp, XiaomiRegion])[] = [
  [RUSSIAN_ZONES, 'ru'],
  [/^Asia\/(Kolkata|Calcutta)$/, 'i2'],
  [/^(Europe\/|Atlantic\/(Reykjavik|Canary|Madeira|Azores|Faroe|Faeroe)$)/, 'de'],
  [/^(America\/|US\/|Canada\/|Pacific\/Honolulu$)/, 'us'],
];

export function xiaomiRegionFor(timeZone: string): XiaomiRegion {
  if (CHINA_ZONES.has(timeZone)) {
    return 'cn';
  }
  const found = ZONE_REGIONS.find(([pattern]) => pattern.test(timeZone));
  return found === undefined ? 'sg' : found[1];
}

export interface ProviderInfo {
  readonly name: string;
  readonly brand: string;
  readonly summary: string;
  readonly addable: boolean;
}

export interface XiaomiInfo extends ProviderInfo {
  readonly regionFor: (timeZone: string) => XiaomiRegion;
}

export type ProviderInfos = { readonly xiaomi: XiaomiInfo } & Readonly<
  Record<Exclude<Provider, 'xiaomi'>, ProviderInfo>
>;

export const PROVIDER_INFO: ProviderInfos = {
  xiaomi: {
    name: 'Xiaomi',
    brand: 'Mi Home',
    summary: 'Mi Home devices',
    addable: true,
    regionFor: xiaomiRegionFor,
  },
  tuya: { name: 'Tuya', brand: 'Smart Life', summary: 'Smart Life devices', addable: true },
  smartthings: {
    name: 'SmartThings',
    brand: 'Samsung SmartThings',
    summary: 'Samsung SmartThings devices',
    addable: true,
  },
  samsung_tv: {
    name: 'Samsung TV',
    brand: 'Samsung',
    summary: 'Samsung TVs on your network, added as devices',
    addable: false,
  },
  local: {
    name: 'SmartEverything',
    brand: 'SmartEverything',
    summary: 'Devices SmartEverything talks to itself, such as a Bluetooth scale',
    addable: false,
  },
};

export const ADDABLE_PROVIDERS: readonly Provider[] = PROVIDERS.filter(
  (provider) => PROVIDER_INFO[provider].addable,
);
