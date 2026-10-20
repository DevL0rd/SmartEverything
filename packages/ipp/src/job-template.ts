import { IppEncodeError } from './errors';
import type { IppAttribute } from './model';
import { ORIENTATION, QUALITY } from './ops';
import { attribute, ipp } from './values';

export interface JobTemplate {
  readonly copies?: number | undefined;
  readonly sides?: 'one-sided' | 'two-sided-long-edge' | 'two-sided-short-edge' | undefined;
  readonly colorMode?: string | undefined;
  readonly quality?: keyof typeof QUALITY | undefined;
  readonly media?: string | undefined;
  readonly mediaSource?: string | undefined;
  readonly mediaType?: string | undefined;
  readonly orientation?: keyof typeof ORIENTATION | undefined;
  readonly pageRanges?: string | undefined;
  readonly numberUp?: number | undefined;
  readonly scaling?: string | undefined;
  readonly outputBin?: string | undefined;
  readonly resolution?: number | undefined;
  readonly contentOptimize?: string | undefined;
  readonly priority?: number | undefined;
  readonly holdUntil?: string | undefined;
  readonly finishings?: readonly number[] | undefined;
}

const MEDIA_SIZE = /_(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(mm|in)(?:_|$)/u;
const HUNDREDTHS_MM_PER_UNIT = { mm: 100, in: 2540 } as const;
const RANGE = /^(\d+)(?:-(\d+))?$/u;

export function mediaSizeOf(name: string): { readonly width: number; readonly height: number } {
  const match = MEDIA_SIZE.exec(name);
  const [, width, height, unit] = match ?? [];
  const scale = unit === 'mm' || unit === 'in' ? HUNDREDTHS_MM_PER_UNIT[unit] : undefined;
  if (width === undefined || height === undefined || scale === undefined) {
    throw new IppEncodeError('media', 'a size name such as iso_a4_210x297mm', name);
  }
  return { width: Math.round(Number(width) * scale), height: Math.round(Number(height) * scale) };
}

function mediaCol(template: JobTemplate): IppAttribute | null {
  const { media, mediaSource, mediaType } = template;
  if (media === undefined) return null;
  const size = mediaSizeOf(media);
  const members: IppAttribute[] = [
    attribute(
      'media-size',
      ipp.collection([
        attribute('x-dimension', ipp.integer(size.width)),
        attribute('y-dimension', ipp.integer(size.height)),
      ]),
    ),
  ];
  if (mediaSource !== undefined) members.push(attribute('media-source', ipp.keyword(mediaSource)));
  if (mediaType !== undefined) members.push(attribute('media-type', ipp.keyword(mediaType)));
  return attribute('media-col', ipp.collection(members));
}

function pageRanges(text: string): IppAttribute {
  const ranges = text.split(',').map((part) => {
    const match = RANGE.exec(part.trim());
    const [, lower, upper] = match ?? [];
    if (lower === undefined) {
      throw new IppEncodeError('page ranges', 'numbers such as 1-3,5', text);
    }
    return ipp.range(Number(lower), Number(upper ?? lower));
  });
  return attribute('page-ranges', ...ranges);
}

function scalars(template: JobTemplate): readonly (IppAttribute | null)[] {
  const { copies, sides, colorMode, quality, orientation, numberUp, scaling, priority } = template;
  return [
    copies === undefined ? null : attribute('copies', ipp.integer(copies)),
    sides === undefined ? null : attribute('sides', ipp.keyword(sides)),
    colorMode === undefined ? null : attribute('print-color-mode', ipp.keyword(colorMode)),
    quality === undefined ? null : attribute('print-quality', ipp.enumeration(QUALITY[quality])),
    orientation === undefined
      ? null
      : attribute('orientation-requested', ipp.enumeration(ORIENTATION[orientation])),
    numberUp === undefined ? null : attribute('number-up', ipp.integer(numberUp)),
    scaling === undefined ? null : attribute('print-scaling', ipp.keyword(scaling)),
    priority === undefined ? null : attribute('job-priority', ipp.integer(priority)),
  ];
}

function extras(template: JobTemplate): readonly (IppAttribute | null)[] {
  const {
    outputBin,
    resolution,
    contentOptimize,
    holdUntil,
    finishings,
    pageRanges: ranges,
  } = template;
  return [
    outputBin === undefined ? null : attribute('output-bin', ipp.keyword(outputBin)),
    resolution === undefined
      ? null
      : attribute('printer-resolution', {
          kind: 'resolution',
          x: resolution,
          y: resolution,
          units: 3,
        }),
    contentOptimize === undefined
      ? null
      : attribute('print-content-optimize', ipp.keyword(contentOptimize)),
    holdUntil === undefined ? null : attribute('job-hold-until', ipp.keyword(holdUntil)),
    finishings === undefined || finishings.length === 0
      ? null
      : attribute('finishings', ...finishings.map((value) => ipp.enumeration(value))),
    ranges === undefined ? null : pageRanges(ranges),
  ];
}

export function jobTemplateAttributes(template: JobTemplate): readonly IppAttribute[] {
  return [...scalars(template), mediaCol(template), ...extras(template)].filter(
    (entry): entry is IppAttribute => entry !== null,
  );
}
