import {
  PrinterError,
  type PrinterPrintOptions,
  type PrinterSource,
} from '@smarteverything/domain';
import {
  jobTemplateAttributes,
  mediaSizeOf,
  type JobTemplate,
  type PrinterDescription,
  type Submission,
} from '@smarteverything/ipp';
import { basename } from 'node:path';
import type { ToolCaller } from '../contract';
import type { PrinterClient } from './client';
import type { Converter, RasterRequest } from './convert';
import type { PrinterPrefs } from './settings';

export type DocumentKind = 'pdf' | 'jpeg' | 'png' | 'webp';

const POINTS_PER_HUNDREDTH_MM = 72 / 2540;
const MAX_DPI = 300;
const FALLBACK_DPI = 300;
const QUALITY_VALUES = { draft: 3, normal: 4, high: 5 } as const;
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

export const KIND_MIME: Readonly<Record<DocumentKind, string>> = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function starts(data: Uint8Array, magic: readonly number[], offset = 0): boolean {
  return magic.every((byte, index) => data[offset + index] === byte);
}

export function kindOf(data: Uint8Array): DocumentKind | null {
  if (starts(data, PDF_MAGIC)) return 'pdf';
  if (starts(data, JPEG_MAGIC)) return 'jpeg';
  if (starts(data, PNG_MAGIC)) return 'png';
  if (starts(data, RIFF) && starts(data, WEBP, 8)) return 'webp';
  return null;
}

export interface PrintPorts {
  readonly files: {
    readonly fromUpload: (
      caller: ToolCaller,
      id: string,
    ) => Promise<{ data: Buffer; name: string } | null>;
    readonly attachmentsOf: (chatId: string) => readonly string[];
    readonly fromMachine: (
      caller: ToolCaller,
      input: { machine: string; path: string },
    ) => Promise<{ data: Buffer; name: string } | null>;
    readonly readAttachment: (path: string) => Promise<Buffer>;
  };
  readonly converter: Converter;
}

export interface LoadedDocument {
  readonly data: Uint8Array;
  readonly name: string;
  readonly kind: DocumentKind;
}

export async function loadSource(
  ports: PrintPorts,
  caller: ToolCaller,
  source: PrinterSource,
): Promise<LoadedDocument> {
  const file = await rawFile(ports, caller, source);
  const kind = kindOf(file.data);
  if (kind === null) {
    throw new PrinterError(
      'format_unsupported',
      `${file.name} is not a PDF, JPEG, PNG or WebP file. Convert it first.`,
      { accepted: 'pdf, jpeg, png, webp' },
    );
  }
  return { data: file.data, name: file.name, kind };
}

async function rawFile(
  ports: PrintPorts,
  caller: ToolCaller,
  source: PrinterSource,
): Promise<{ data: Uint8Array; name: string }> {
  if (source.kind === 'upload') {
    const file = await ports.files.fromUpload(caller, source.uploadId);
    if (file === null)
      throw new PrinterError('not_authorized', 'That upload is not yours to print.');
    return file;
  }
  if (source.kind === 'machine') {
    const file = await ports.files.fromMachine(caller, {
      machine: source.machine,
      path: source.path,
    });
    if (file === null)
      throw new PrinterError('not_authorized', 'That computer cannot be read for printing.');
    return file;
  }
  if (caller.chatId === null)
    throw new PrinterError('not_authorized', 'There is no chat to take an attachment from.');
  const matches = ports.files
    .attachmentsOf(caller.chatId)
    .filter((candidate) => basename(candidate) === source.name);
  const [path] = matches;
  if (path === undefined)
    throw new PrinterError('not_authorized', `This chat has no attachment named ${source.name}.`);
  if (matches.length > 1) {
    throw new PrinterError(
      'ambiguous_file',
      `This chat has ${String(matches.length)} attachments named ${source.name}..`,
      { name: source.name, matches: matches.length },
    );
  }
  return { data: await ports.files.readAttachment(path), name: source.name };
}

function sizeOf(name: string): { widthPoints: number; heightPoints: number } {
  try {
    const size = mediaSizeOf(name);
    return {
      widthPoints: Math.round(size.width * POINTS_PER_HUNDREDTH_MM),
      heightPoints: Math.round(size.height * POINTS_PER_HUNDREDTH_MM),
    };
  } catch (cause) {
    throw new PrinterError(
      'format_unsupported',
      `The paper size of ${name} is not known, so the page cannot be laid out.`,
      { cause: cause instanceof Error ? cause.message : 'unknown' },
    );
  }
}

function accepts(list: readonly string[], value: string): boolean {
  return list.length === 0 || list.includes(value);
}

export function resolveOptions(
  description: PrinterDescription,
  prefs: PrinterPrefs,
  requested: PrinterPrintOptions,
): PrinterPrintOptions {
  const caps = description.capabilities;
  const own: PrinterPrintOptions = {
    ...(prefs.sides !== null && accepts(caps.sides, prefs.sides) ? { sides: prefs.sides } : {}),
    ...(prefs.colorMode !== null && accepts(caps.colorModes, prefs.colorMode)
      ? { colorMode: prefs.colorMode }
      : {}),
    ...(prefs.quality === null ? {} : { quality: prefs.quality }),
    ...(prefs.media === null ? {} : { media: prefs.media }),
    ...(prefs.copies === null ? {} : { copies: prefs.copies }),
  };
  return {
    ...own,
    ...Object.fromEntries(Object.entries(requested).filter(([, value]) => value !== undefined)),
  };
}

export function templateOf(options: PrinterPrintOptions): JobTemplate {
  return options;
}

export interface Plan {
  readonly format: string;
  readonly body: Uint8Array;
  readonly converted: boolean;
}

function chooseDpi(description: PrinterDescription): number {
  const dpis = description.capabilities.rasterResolutions;
  if (dpis.length === 0) return FALLBACK_DPI;
  const fitting = dpis.filter((dpi) => dpi <= MAX_DPI);
  return fitting.length > 0 ? Math.max(...fitting) : Math.min(...dpis);
}

function rasterRequest(
  description: PrinterDescription,
  options: PrinterPrintOptions,
  mediaName: string,
): RasterRequest {
  const types = description.capabilities.rasterTypes;
  const colour =
    description.capabilities.color === true &&
    options.colorMode !== 'monochrome' &&
    options.colorMode !== 'auto-monochrome';
  const wantsRgb = colour && (types.length === 0 || types.includes('srgb_8'));
  const duplex = options.sides !== undefined && options.sides !== 'one-sided';
  return {
    dpi: chooseDpi(description),
    ...sizeOf(mediaName),
    space: wantsRgb ? 'srgb' : 'sgray',
    pageSizeName: mediaName,
    quality: options.quality === undefined ? 0 : QUALITY_VALUES[options.quality],
    copies: options.copies ?? 1,
    duplex,
    tumble: options.sides === 'two-sided-short-edge',
    sheetBack: description.capabilities.rasterSheetBack,
  };
}

export interface PlanInput {
  readonly description: PrinterDescription;
  readonly document: LoadedDocument;
  readonly options: PrinterPrintOptions;
  readonly media: string;
}

export async function plan(ports: PrintPorts, input: PlanInput): Promise<Plan> {
  const { description, document, options } = input;
  const accepted = description.capabilities.formats;
  const mime = KIND_MIME[document.kind];
  if (accepted.includes(mime)) return { format: mime, body: document.data, converted: false };
  if (document.kind !== 'pdf' && accepted.includes('image/jpeg')) {
    return {
      format: 'image/jpeg',
      body: await ports.converter.imageToJpeg(document.data),
      converted: true,
    };
  }
  if (accepted.includes('image/pwg-raster')) {
    const request = rasterRequest(description, options, options.media ?? input.media);
    const convert =
      document.kind === 'pdf' ? ports.converter.pdfToRaster : ports.converter.imageToRaster;
    return {
      format: 'image/pwg-raster',
      body: await convert(document.data, request),
      converted: true,
    };
  }
  throw new PrinterError(
    'format_unsupported',
    `${description.identity.name ?? 'The printer'} takes ${accepted.join(', ') || 'no document format it reported'}; ${document.kind.toUpperCase()} cannot be converted to any of them.`,
    { accepted: accepted.join(',') },
  );
}

export function submissionOf(
  name: string,
  format: string,
  options: PrinterPrintOptions,
): Submission {
  return {
    jobName: name,
    documentFormat: format,
    template: jobTemplateAttributes(templateOf(options)),
    fidelity: false,
  };
}

export async function validate(
  client: Pick<PrinterClient, 'validate'>,
  submission: Submission,
): Promise<void> {
  const response = await client.validate(submission);
  const unsupported = response.unsupported.flatMap((group) => Object.keys(group));
  if (unsupported.length > 0) {
    throw new PrinterError(
      'format_unsupported',
      `The printer does not accept these options: ${unsupported.join(', ')}.`,
      { unsupported: unsupported.join(',') },
    );
  }
}

export function sendAsSplit(description: PrinterDescription): boolean {
  const operations = description.capabilities.operations;
  return operations.includes(0x0005) && operations.includes(0x0006);
}
