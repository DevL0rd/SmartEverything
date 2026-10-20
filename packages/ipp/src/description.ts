import { z } from 'zod';
import type { PlainObject } from './plain';
import { SHEET_BACKS, type SheetBack } from './pwg-raster';
import { maybe, maybeSet, present, readSource, type DropReporter } from './schema-kit';
import { readStatus, type PrinterStatus } from './status';

const FINISHING_NONE = 3;
const RANGE = z.object({ lower: z.number(), upper: z.number() });
const RESOLUTION = z.object({ x: z.number(), y: z.number(), units: z.string() });

export interface PrinterIdentity {
  readonly name: string | null;
  readonly info: string | null;
  readonly location: string | null;
  readonly makeAndModel: string | null;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly serial: string | null;
  readonly uuid: string | null;
  readonly firmware: string | null;
  readonly moreInfo: string | null;
  readonly supplyInfo: string | null;
  readonly icons: readonly string[];
  readonly uris: readonly string[];
  readonly kinds: readonly string[];
  readonly wifiSsid: string | null;
}

export interface PrinterCapabilities {
  readonly versions: readonly string[];
  readonly features: readonly string[];
  readonly operations: readonly number[];
  readonly authentication: readonly string[];
  readonly security: readonly string[];
  readonly formats: readonly string[];
  readonly color: boolean | null;
  readonly pagesPerMinute: number | null;
  readonly pagesPerMinuteColor: number | null;
  readonly sides: readonly string[];
  readonly colorModes: readonly string[];
  readonly qualities: readonly number[];
  readonly resolutions: readonly number[];
  readonly media: readonly string[];
  readonly mediaSources: readonly string[];
  readonly mediaTypes: readonly string[];
  readonly outputBins: readonly string[];
  readonly orientations: readonly number[];
  readonly scalings: readonly string[];
  readonly contentOptimize: readonly string[];
  readonly finishings: readonly number[];
  readonly numberUp: readonly number[];
  readonly copies: { readonly lower: number; readonly upper: number } | null;
  readonly pageRanges: boolean;
  readonly priorities: { readonly lower: number; readonly upper: number } | null;
  readonly holdUntil: readonly string[];
  readonly identifyActions: readonly string[];
  readonly whichJobs: readonly string[];
  readonly rasterTypes: readonly string[];
  readonly rasterResolutions: readonly number[];
  readonly rasterSheetBack: SheetBack;
}

export interface PrinterDefaults {
  readonly sides: string | null;
  readonly colorMode: string | null;
  readonly quality: number | null;
  readonly media: string | null;
  readonly copies: number | null;
  readonly orientation: number | null;
  readonly scaling: string | null;
  readonly outputBin: string | null;
}

export interface PrinterDescription {
  readonly identity: PrinterIdentity;
  readonly capabilities: PrinterCapabilities;
  readonly defaults: PrinterDefaults;
  readonly status: PrinterStatus;
}

const DESCRIPTION_SOURCE = z.object({
  'printer-name': maybe(z.string()),
  'printer-info': maybe(z.string()),
  'printer-location': maybe(z.string()),
  'printer-make-and-model': maybe(z.string()),
  'printer-device-id': maybe(z.string()),
  'printer-serial-number': maybe(z.string()),
  'printer-uuid': maybe(z.string()),
  'printer-firmware-string-version': maybeSet(z.string()),
  'printer-more-info': maybe(z.string()),
  'printer-supply-info-uri': maybe(z.string()),
  'printer-icons': maybeSet(z.string()),
  'printer-uri-supported': maybeSet(z.string()),
  'printer-kind': maybeSet(z.string()),
  'printer-wifi-ssid': maybe(z.string()),
  'ipp-versions-supported': maybeSet(z.string()),
  'ipp-features-supported': maybeSet(z.string()),
  'operations-supported': maybeSet(z.number()),
  'uri-authentication-supported': maybeSet(z.string()),
  'uri-security-supported': maybeSet(z.string()),
  'document-format-supported': maybeSet(z.string()),
  'color-supported': maybe(z.boolean()),
  'pages-per-minute': maybe(z.number()),
  'pages-per-minute-color': maybe(z.number()),
  'sides-supported': maybeSet(z.string()),
  'print-color-mode-supported': maybeSet(z.string()),
  'print-quality-supported': maybeSet(z.number()),
  'printer-resolution-supported': maybeSet(RESOLUTION),
  'media-supported': maybeSet(z.string()),
  'media-source-supported': maybeSet(z.string()),
  'media-type-supported': maybeSet(z.string()),
  'output-bin-supported': maybeSet(z.string()),
  'orientation-requested-supported': maybeSet(z.number()),
  'print-scaling-supported': maybeSet(z.string()),
  'print-content-optimize-supported': maybeSet(z.string()),
  'finishings-supported': maybeSet(z.number()),
  'number-up-supported': maybeSet(z.number()),
  'copies-supported': maybe(RANGE),
  'page-ranges-supported': maybe(z.boolean()),
  'job-priority-supported': maybe(z.union([z.number(), RANGE])),
  'job-hold-until-supported': maybeSet(z.string()),
  'identify-actions-supported': maybeSet(z.string()),
  'which-jobs-supported': maybeSet(z.string()),
  'pwg-raster-document-type-supported': maybeSet(z.string()),
  'pwg-raster-document-resolution-supported': maybeSet(RESOLUTION),
  'pwg-raster-document-sheet-back': maybe(z.enum(SHEET_BACKS)),
  'sides-default': maybe(z.string()),
  'print-color-mode-default': maybe(z.string()),
  'print-quality-default': maybe(z.number()),
  'media-default': maybe(z.string()),
  'copies-default': maybe(z.number()),
  'orientation-requested-default': maybe(z.number()),
  'print-scaling-default': maybe(z.string()),
  'output-bin-default': maybe(z.string()),
});

function blank(text: string | undefined): string | null {
  return text === undefined || text === '' ? null : text;
}

function deviceIdField(deviceId: string | undefined, keys: readonly string[]): string | null {
  for (const part of (deviceId ?? '').split(';')) {
    const split = part.indexOf(':');
    if (split > 0 && keys.includes(part.slice(0, split).trim().toUpperCase())) {
      return blank(part.slice(split + 1).trim());
    }
  }
  return null;
}

function uuidOf(text: string | undefined): string | null {
  return blank(text?.replace(/^urn:uuid:/iu, '').toLowerCase());
}

function priorityRange(
  value: number | z.output<typeof RANGE> | undefined,
): { readonly lower: number; readonly upper: number } | null {
  if (value === undefined) return null;
  return typeof value === 'number' ? { lower: 1, upper: value } : value;
}

function identityOf(source: z.output<typeof DESCRIPTION_SOURCE>): PrinterIdentity {
  const deviceId = source['printer-device-id'];
  return {
    name: blank(source['printer-name']),
    info: blank(source['printer-info']),
    location: blank(source['printer-location']),
    makeAndModel: blank(source['printer-make-and-model']),
    manufacturer: deviceIdField(deviceId, ['MFG', 'MANUFACTURER']),
    model: deviceIdField(deviceId, ['MDL', 'MODEL']),
    serial: blank(source['printer-serial-number']) ?? deviceIdField(deviceId, ['SN', 'SERN']),
    uuid: uuidOf(source['printer-uuid']),
    firmware: source['printer-firmware-string-version'][0] ?? null,
    moreInfo: blank(source['printer-more-info']),
    supplyInfo: blank(source['printer-supply-info-uri']),
    icons: source['printer-icons'],
    uris: source['printer-uri-supported'],
    kinds: source['printer-kind'],
    wifiSsid: blank(source['printer-wifi-ssid']),
  };
}

function capabilitiesOf(source: z.output<typeof DESCRIPTION_SOURCE>): PrinterCapabilities {
  return {
    versions: source['ipp-versions-supported'],
    features: source['ipp-features-supported'],
    operations: source['operations-supported'],
    authentication: [...new Set(source['uri-authentication-supported'])],
    security: [...new Set(source['uri-security-supported'])],
    formats: source['document-format-supported'],
    color: source['color-supported'] ?? null,
    pagesPerMinute: source['pages-per-minute'] ?? null,
    pagesPerMinuteColor: source['pages-per-minute-color'] ?? null,
    sides: source['sides-supported'],
    colorModes: source['print-color-mode-supported'],
    qualities: source['print-quality-supported'],
    resolutions: [...new Set(source['printer-resolution-supported'].map((entry) => entry.x))],
    media: source['media-supported'],
    mediaSources: source['media-source-supported'],
    mediaTypes: source['media-type-supported'],
    outputBins: source['output-bin-supported'],
    orientations: source['orientation-requested-supported'],
    scalings: source['print-scaling-supported'],
    contentOptimize: source['print-content-optimize-supported'],
    finishings: source['finishings-supported'].filter((value) => value !== FINISHING_NONE),
    numberUp: source['number-up-supported'],
    copies: source['copies-supported'] ?? null,
    pageRanges: source['page-ranges-supported'] ?? false,
    priorities: priorityRange(source['job-priority-supported']),
    holdUntil: source['job-hold-until-supported'],
    identifyActions: source['identify-actions-supported'],
    whichJobs: source['which-jobs-supported'],
    rasterTypes: source['pwg-raster-document-type-supported'],
    rasterResolutions: [
      ...new Set(source['pwg-raster-document-resolution-supported'].map((entry) => entry.x)),
    ],
    rasterSheetBack: source['pwg-raster-document-sheet-back'] ?? 'normal',
  };
}

function defaultsOf(source: z.output<typeof DESCRIPTION_SOURCE>): PrinterDefaults {
  return {
    sides: blank(source['sides-default']),
    colorMode: blank(source['print-color-mode-default']),
    quality: source['print-quality-default'] ?? null,
    media: blank(source['media-default']),
    copies: source['copies-default'] ?? null,
    orientation: source['orientation-requested-default'] ?? null,
    scaling: blank(source['print-scaling-default']),
    outputBin: blank(source['output-bin-default']),
  };
}

export function readDescription(plain: PlainObject, report?: DropReporter): PrinterDescription {
  const source = readSource(DESCRIPTION_SOURCE, present(plain), report);
  return {
    identity: identityOf(source),
    capabilities: capabilitiesOf(source),
    defaults: defaultsOf(source),
    status: readStatus(plain, report),
  };
}
