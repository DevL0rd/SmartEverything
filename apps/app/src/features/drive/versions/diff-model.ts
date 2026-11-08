import type { DriveItem } from '@smarteverything/domain';
import { diffLines } from 'diff/lib/diff/line.js';
import type { FileDiffLine } from '../../../components/diff-line';
import { count } from '../../../format/number';
import { contentOf, showsImageFile } from '../quick-look/quick-look-model';

export type CompareKind = 'image' | 'text' | 'download';

export function compareKindOf(item: DriveItem): CompareKind {
  const content = contentOf(item);
  if (content === 'image') return 'image';
  return content === 'text' ? 'text' : 'download';
}

export type ImageMode = 'side' | 'swipe';

export const IMAGE_MODE_LABEL: Readonly<Record<ImageMode, string>> = {
  side: 'Side by side',
  swipe: 'Swipe',
};

export function imageModesFor(pointer: boolean): readonly ImageMode[] {
  return pointer ? ['side', 'swipe'] : ['swipe', 'side'];
}

export const SWIPE_START = 0.5;

export const SWIPE_STEP = 0.1;

export const ZOOM_STEP = 1.25;

export function clampSplit(value: number): number {
  'worklet';
  return Math.min(1, Math.max(0, value));
}

export function zoomPercent(zoom: number): number {
  'worklet';
  return Math.round(zoom * 100);
}

export function swipeCaption(mode: ImageMode): string {
  return mode === 'side'
    ? 'Zoom and pan move both sides together.'
    : 'Drag the line to move between A and B. Zoom and pan move both together.';
}

export type VersionLinkSize = 'file' | 'preview';

export function imageSizeOf(item: DriveItem): VersionLinkSize {
  return item.kind === 'image' && showsImageFile(item.mime) ? 'file' : 'preview';
}

function textLines(text: string): readonly string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  return text.endsWith('\n') ? lines.slice(0, -1) : lines;
}

type LineKind = FileDiffLine['kind'];

function lineCounter(): (kind: LineKind, text: string) => FileDiffLine {
  let oldLine = 1;
  let newLine = 1;
  return (kind, text) => {
    const line = {
      kind,
      text,
      oldLine: kind === 'add' ? null : oldLine,
      newLine: kind === 'remove' ? null : newLine,
    };
    if (kind !== 'add') oldLine += 1;
    if (kind !== 'remove') newLine += 1;
    return line;
  };
}

export interface LineDiff {
  readonly lines: readonly FileDiffLine[];
  readonly added: number;
  readonly removed: number;
}

interface Change {
  readonly value: string;
  readonly added: boolean;
  readonly removed: boolean;
}

export function lineDiffOf(changes: readonly Change[]): LineDiff {
  const make = lineCounter();
  const lines = changes.flatMap((change) => {
    const kind: LineKind = change.added ? 'add' : change.removed ? 'remove' : 'context';
    return textLines(change.value).map((text) => make(kind, text));
  });
  return {
    lines,
    added: lines.filter((line) => line.kind === 'add').length,
    removed: lines.filter((line) => line.kind === 'remove').length,
  };
}

export interface ComparedText {
  readonly diff: LineDiff;
  readonly language: string | null;
}

export function diffTexts(before: string, after: string): Promise<LineDiff> {
  return new Promise((resolve) => {
    diffLines(before, after, {
      callback: (changes) => {
        resolve(lineDiffOf(changes));
      },
    });
  });
}

export const UNCHANGED_CONTEXT = 3;

export type DiffSegment =
  | { readonly kind: 'lines'; readonly key: string; readonly lines: readonly FileDiffLine[] }
  | { readonly kind: 'unchanged'; readonly key: string; readonly count: number };

function nearChange(lines: readonly FileDiffLine[], context: number): readonly boolean[] {
  const near = lines.map(() => false);
  let last = -Infinity;
  lines.forEach((line, index) => {
    if (line.kind !== 'context') last = index;
    near[index] = index - last <= context;
  });
  let next = Infinity;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index]?.kind !== 'context') next = index;
    near[index] = near[index] === true || next - index <= context;
  }
  return near;
}

function pushRun(
  segments: DiffSegment[],
  run: readonly FileDiffLine[],
  kept: boolean,
  start: number,
): void {
  if (run.length === 0) return;
  const key = String(start);
  segments.push(
    kept ? { kind: 'lines', key, lines: run } : { kind: 'unchanged', key, count: run.length },
  );
}

export function segmentsOf(
  lines: readonly FileDiffLine[],
  showUnchanged: boolean,
  context = UNCHANGED_CONTEXT,
): readonly DiffSegment[] {
  if (showUnchanged) return lines.length === 0 ? [] : [{ kind: 'lines', key: '0', lines }];
  const near = nearChange(lines, context);
  const segments: DiffSegment[] = [];
  let run: FileDiffLine[] = [];
  let start = 0;
  lines.forEach((line, index) => {
    const kept = near[index] === true;
    if (index > 0 && kept !== (near[index - 1] === true)) {
      pushRun(segments, run, near[index - 1] === true, start);
      run = [];
      start = index;
    }
    run.push(line);
  });
  pushRun(segments, run, near[lines.length - 1] === true, start);
  return segments;
}

export function unchangedText(lines: number): string {
  return lines === 1 ? '1 unchanged line' : `${count(lines)} unchanged lines`;
}

export function changeSummary(diff: LineDiff): string {
  if (diff.added === 0 && diff.removed === 0) return 'No line changes between B and A';
  return 'lines between B and A';
}

export function signedCount(sign: '+' | '−', value: number): string {
  return `${sign}${count(value)}`;
}

export function gutterDigits(lines: readonly FileDiffLine[]): number {
  const widest = lines.reduce(
    (most, line) => Math.max(most, line.newLine ?? 0, line.oldLine ?? 0),
    0,
  );
  return String(widest).length;
}

export type FetchText = (url: string, init: RequestInit) => Promise<Response>;

class VersionTextReadError extends Error {
  override readonly name = 'VersionTextReadError';
}

export async function readVersionText(
  url: string,
  total: number,
  fetchText: FetchText,
): Promise<string> {
  if (total === 0) return '';
  const response = await fetchText(url, {
    headers: { Range: `bytes=0-${String(total - 1)}` },
  });
  if (!response.ok) throw new VersionTextReadError(`The hub answered ${String(response.status)}.`);
  return new TextDecoder('utf-8').decode(new Uint8Array(await response.arrayBuffer()));
}
