import { z } from 'zod';

export interface RegionInfo {
  readonly name: string;
  readonly currency: string;
  readonly locale: string;
}

export const REGIONS = {
  AT: { name: 'Austria', currency: 'EUR', locale: 'de-AT' },
  AU: { name: 'Australia', currency: 'AUD', locale: 'en-AU' },
  BE: { name: 'Belgium', currency: 'EUR', locale: 'nl-BE' },
  BG: { name: 'Bulgaria', currency: 'EUR', locale: 'bg-BG' },
  BR: { name: 'Brazil', currency: 'BRL', locale: 'pt-BR' },
  CA: { name: 'Canada', currency: 'CAD', locale: 'en-CA' },
  CH: { name: 'Switzerland', currency: 'CHF', locale: 'de-CH' },
  CN: { name: 'China', currency: 'CNY', locale: 'zh-CN' },
  CZ: { name: 'Czechia', currency: 'CZK', locale: 'cs-CZ' },
  DE: { name: 'Germany', currency: 'EUR', locale: 'de-DE' },
  DK: { name: 'Denmark', currency: 'DKK', locale: 'da-DK' },
  EE: { name: 'Estonia', currency: 'EUR', locale: 'et-EE' },
  ES: { name: 'Spain', currency: 'EUR', locale: 'es-ES' },
  FI: { name: 'Finland', currency: 'EUR', locale: 'fi-FI' },
  FR: { name: 'France', currency: 'EUR', locale: 'fr-FR' },
  GB: { name: 'United Kingdom', currency: 'GBP', locale: 'en-GB' },
  GR: { name: 'Greece', currency: 'EUR', locale: 'el-GR' },
  HK: { name: 'Hong Kong', currency: 'HKD', locale: 'zh-HK' },
  HR: { name: 'Croatia', currency: 'EUR', locale: 'hr-HR' },
  HU: { name: 'Hungary', currency: 'HUF', locale: 'hu-HU' },
  ID: { name: 'Indonesia', currency: 'IDR', locale: 'id-ID' },
  IE: { name: 'Ireland', currency: 'EUR', locale: 'en-IE' },
  IL: { name: 'Israel', currency: 'ILS', locale: 'he-IL' },
  IN: { name: 'India', currency: 'INR', locale: 'en-IN' },
  IS: { name: 'Iceland', currency: 'ISK', locale: 'is-IS' },
  IT: { name: 'Italy', currency: 'EUR', locale: 'it-IT' },
  JP: { name: 'Japan', currency: 'JPY', locale: 'ja-JP' },
  KR: { name: 'South Korea', currency: 'KRW', locale: 'ko-KR' },
  LT: { name: 'Lithuania', currency: 'EUR', locale: 'lt-LT' },
  LV: { name: 'Latvia', currency: 'EUR', locale: 'lv-LV' },
  MX: { name: 'Mexico', currency: 'MXN', locale: 'es-MX' },
  MY: { name: 'Malaysia', currency: 'MYR', locale: 'ms-MY' },
  NL: { name: 'Netherlands', currency: 'EUR', locale: 'nl-NL' },
  NO: { name: 'Norway', currency: 'NOK', locale: 'nb-NO' },
  NZ: { name: 'New Zealand', currency: 'NZD', locale: 'en-NZ' },
  PH: { name: 'Philippines', currency: 'PHP', locale: 'en-PH' },
  PL: { name: 'Poland', currency: 'PLN', locale: 'pl-PL' },
  PT: { name: 'Portugal', currency: 'EUR', locale: 'pt-PT' },
  RO: { name: 'Romania', currency: 'RON', locale: 'ro-RO' },
  SE: { name: 'Sweden', currency: 'SEK', locale: 'sv-SE' },
  SG: { name: 'Singapore', currency: 'SGD', locale: 'en-SG' },
  SI: { name: 'Slovenia', currency: 'EUR', locale: 'sl-SI' },
  SK: { name: 'Slovakia', currency: 'EUR', locale: 'sk-SK' },
  TH: { name: 'Thailand', currency: 'THB', locale: 'th-TH' },
  TR: { name: 'Türkiye', currency: 'TRY', locale: 'tr-TR' },
  US: { name: 'United States', currency: 'USD', locale: 'en-US' },
  ZA: { name: 'South Africa', currency: 'ZAR', locale: 'en-ZA' },
} as const satisfies Readonly<Record<string, RegionInfo>>;

export type RegionCode = keyof typeof REGIONS;

export const REGION_CODES = Object.keys(REGIONS).filter(isRegionCode);

export function isRegionCode(value: string): value is RegionCode {
  return Object.hasOwn(REGIONS, value);
}

const REGION_CHOICES = ['auto', ...REGION_CODES] as const;

export const REGION_PREF = z.strictObject({
  region: z
    .enum(REGION_CHOICES)
    .describe(
      'Where money amounts are shown for: auto detects from this device, or a two-letter country code such as US, GB, DE or JP. Costs are stored in US dollars and converted for display',
    ),
});

export type RegionPref = z.infer<typeof REGION_PREF>;

export const STORED_CURRENCY = 'USD';

const ZONES_OF: Readonly<Record<RegionCode, readonly string[]>> = {
  AT: ['Europe/Vienna'],
  AU: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth'],
  BE: ['Europe/Brussels'],
  BG: ['Europe/Sofia'],
  BR: ['America/Sao_Paulo', 'America/Manaus', 'America/Fortaleza'],
  CA: ['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg'],
  CH: ['Europe/Zurich'],
  CN: ['Asia/Shanghai'],
  CZ: ['Europe/Prague'],
  DE: ['Europe/Berlin'],
  DK: ['Europe/Copenhagen'],
  EE: ['Europe/Tallinn'],
  ES: ['Europe/Madrid'],
  FI: ['Europe/Helsinki'],
  FR: ['Europe/Paris'],
  GB: ['Europe/London'],
  GR: ['Europe/Athens'],
  HK: ['Asia/Hong_Kong'],
  HR: ['Europe/Zagreb'],
  HU: ['Europe/Budapest'],
  ID: ['Asia/Jakarta', 'Asia/Makassar'],
  IE: ['Europe/Dublin'],
  IL: ['Asia/Jerusalem'],
  IN: ['Asia/Kolkata', 'Asia/Calcutta'],
  IS: ['Atlantic/Reykjavik'],
  IT: ['Europe/Rome'],
  JP: ['Asia/Tokyo'],
  KR: ['Asia/Seoul'],
  LT: ['Europe/Vilnius'],
  LV: ['Europe/Riga'],
  MX: ['America/Mexico_City', 'America/Monterrey', 'America/Tijuana'],
  MY: ['Asia/Kuala_Lumpur'],
  NL: ['Europe/Amsterdam'],
  NO: ['Europe/Oslo'],
  NZ: ['Pacific/Auckland'],
  PH: ['Asia/Manila'],
  PL: ['Europe/Warsaw'],
  PT: ['Europe/Lisbon'],
  RO: ['Europe/Bucharest'],
  SE: ['Europe/Stockholm'],
  SG: ['Asia/Singapore'],
  SI: ['Europe/Ljubljana'],
  SK: ['Europe/Bratislava'],
  TH: ['Asia/Bangkok'],
  TR: ['Europe/Istanbul'],
  US: [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'America/Anchorage',
    'America/Detroit',
    'Pacific/Honolulu',
  ],
  ZA: ['Africa/Johannesburg'],
};

export interface DeviceRegionSource {
  readonly locale: string;
  readonly timeZone: string;
}

export type RegionDetection =
  | {
      readonly status: 'detected';
      readonly region: RegionCode;
      readonly from: 'locale' | 'time_zone';
    }
  | { readonly status: 'unsupported'; readonly code: string }
  | { readonly status: 'unknown' };

export function localeRegionOf(locale: string): string | null {
  return new Intl.Locale(locale.replaceAll('_', '-')).region ?? null;
}

export function regionOfTimeZone(timeZone: string): RegionCode | null {
  return REGION_CODES.find((code) => ZONES_OF[code].includes(timeZone)) ?? null;
}

export function detectRegion(source: DeviceRegionSource): RegionDetection {
  const code = localeRegionOf(source.locale);
  if (code !== null) {
    return isRegionCode(code)
      ? { status: 'detected', region: code, from: 'locale' }
      : { status: 'unsupported', code };
  }
  const zoned = regionOfTimeZone(source.timeZone);
  return zoned === null
    ? { status: 'unknown' }
    : { status: 'detected', region: zoned, from: 'time_zone' };
}

export type RegionResolution =
  | { readonly kind: 'chosen'; readonly region: RegionCode }
  | {
      readonly kind: 'detected';
      readonly region: RegionCode;
      readonly from: 'locale' | 'time_zone';
    }
  | {
      readonly kind: 'undetected';
      readonly detection: Exclude<RegionDetection, { status: 'detected' }>;
    };

export function resolveRegion(pref: RegionPref, source: DeviceRegionSource): RegionResolution {
  if (pref.region !== 'auto') {
    return { kind: 'chosen', region: pref.region };
  }
  const detection = detectRegion(source);
  return detection.status === 'detected'
    ? { kind: 'detected', region: detection.region, from: detection.from }
    : { kind: 'undetected', detection };
}
