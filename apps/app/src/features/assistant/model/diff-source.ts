import type { RecordedFile } from './tool-file-records';
import { diffLanguage } from './diff-language';

export interface RecordedDiffSource {
  readonly label: 'Before' | 'After' | 'Patch' | 'Result';
  readonly text: string;
}
export const RECORDED_SOURCE_PAGE_CHARACTERS = 8192;
const RECORDED_SOURCE_PAGE_LINES = 200;
const pagesBySource = new WeakMap<RecordedDiffSource, readonly number[]>();
export function recordedDiffSource(
  evidence: RecordedFile['evidence'],
): readonly RecordedDiffSource[] {
  if (evidence.kind === 'patch')
    return [
      ...(evidence.before === undefined || evidence.before === null
        ? []
        : [{ label: 'Before' as const, text: evidence.before }]),
      { label: 'Patch', text: evidence.patch },
    ];
  if (evidence.kind !== 'text') return [];
  return [
    ...(evidence.before === null ? [] : [{ label: 'Before' as const, text: evidence.before }]),
    { label: 'After', text: evidence.after },
  ];
}
function firstRecordedLine(evidence: RecordedFile['evidence']): string {
  if (evidence.kind === 'patch') return sourceFirstLine(evidence.before);
  if (evidence.kind !== 'text') return '';
  if (evidence.fullContext || evidence.newStart === 1) return sourceFirstLine(evidence.after);
  return evidence.oldStart === 1 ? sourceFirstLine(evidence.before) : '';
}
export function recordedDiffLanguage(file: RecordedFile): string | null {
  return diffLanguage(file.path, firstRecordedLine(file.evidence));
}

function safeBoundary(text: string, at: number): number {
  const previous = text.charCodeAt(at - 1);
  return previous >= 0xd800 && previous <= 0xdbff && at < text.length ? at - 1 : at;
}
function pageBoundaries(source: RecordedDiffSource): readonly number[] {
  const existing = pagesBySource.get(source);
  if (existing !== undefined) return existing;
  const boundaries = [0];
  let start = 0;
  let lines = 0;
  for (let at = 1; at <= source.text.length; at += 1) {
    if (source.text.charAt(at - 1) === '\n') lines += 1;
    if (at - start < RECORDED_SOURCE_PAGE_CHARACTERS && lines < RECORDED_SOURCE_PAGE_LINES)
      continue;
    const end = safeBoundary(source.text, at);
    boundaries.push(end);
    start = end;
    lines = 0;
  }
  if (start < source.text.length || boundaries.length === 1) boundaries.push(source.text.length);
  pagesBySource.set(source, boundaries);
  return boundaries;
}
export function recordedSourcePage(
  source: RecordedDiffSource,
  page: number,
): { readonly text: string; readonly start: number; readonly end: number; readonly pages: number } {
  const boundaries = pageBoundaries(source);
  const pages = boundaries.length - 1;
  const current = Math.max(0, Math.min(page, pages - 1));
  const start = boundaries[current];
  const end = boundaries[current + 1];
  if (start === undefined || end === undefined)
    throw new Error('Recorded source page has no admitted boundaries.');
  return { text: source.text.slice(start, end), start, end, pages };
}

function sourceFirstLine(text: string | null | undefined): string {
  return text?.split('\n', 1)[0] ?? '';
}
