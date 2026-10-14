import { diffLines } from 'diff/lib/diff/line.js';
import { recordedFiles, type RecordedFile, type FileToolEvidence } from './tool-file-records';
import { retainDiffHunks } from './diff-hunks';
import { diffLanguage } from './diff-language';
import { recordedDiffSource, recordedDiffLanguage, type RecordedDiffSource } from './diff-source';

const SOURCE_CHARACTERS = 131072;
const SOURCE_LINES = 2000;
const MAX_EDIT_LENGTH = 2000;
const DIFF_TIMEOUT_MS = 25;
export const DIFF_PREVIEW_LINES = 12;
export const DIFF_RENDER_LINES = 200;
export const DIFF_LINE_CHARACTERS = 8192;
export interface FileDiffLine {
  readonly kind: 'context' | 'add' | 'remove';
  readonly text: string;
  readonly oldLine: number | null;
  readonly newLine: number | null;
}
export interface ToolFileDiff {
  readonly path: string;
  readonly operation: RecordedFile['operation'];
  readonly lines: readonly FileDiffLine[];
  readonly contextLines: readonly FileDiffLine[];
  readonly displayLimited: boolean;
  readonly source: readonly RecordedDiffSource[];
  readonly language: string | null;
  readonly added: number | null;
  readonly removed: number | null;
  readonly truncated: boolean;
  readonly message: string | null;
  readonly contextRecorded: boolean;
}
function textLines(text: string): readonly string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  return text.endsWith('\n') ? lines.slice(0, -1) : lines;
}
function lineCounter(
  oldStart: number | null,
  newStart: number | null,
): (kind: FileDiffLine['kind'], text: string) => FileDiffLine {
  let oldLine = oldStart;
  let newLine = newStart;
  return (kind, text): FileDiffLine => {
    const line = {
      kind,
      text,
      oldLine: kind === 'add' ? null : oldLine,
      newLine: kind === 'remove' ? null : newLine,
    };
    if (kind !== 'add' && oldLine !== null) oldLine += 1;
    if (kind !== 'remove' && newLine !== null) newLine += 1;
    return line;
  };
}
function compared(
  evidence: Extract<RecordedFile['evidence'], { kind: 'text' }>,
): readonly FileDiffLine[] | null {
  const changes = diffLines(evidence.before ?? '', evidence.after, {
    maxEditLength: MAX_EDIT_LENGTH,
    timeout: DIFF_TIMEOUT_MS,
  });
  if (changes === undefined) return null;
  const makeLine = lineCounter(evidence.oldStart, evidence.newStart);
  return changes.flatMap((change) =>
    textLines(change.value).map((text) =>
      makeLine(change.added ? 'add' : change.removed ? 'remove' : 'context', text),
    ),
  );
}
function patched(patch: string): readonly FileDiffLine[] | null {
  let makeLine = lineCounter(null, null);
  let inHunk = false;
  const lines: FileDiffLine[] = [];
  for (const text of textLines(patch)) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk !== null) {
      makeLine = lineCounter(Number(hunk[1]), Number(hunk[2]));
      inHunk = true;
      continue;
    }
    if (!inHunk || !['+', '-', ' '].includes(text.charAt(0))) continue;
    const kind = text.startsWith('+') ? 'add' : text.startsWith('-') ? 'remove' : 'context';
    lines.push(makeLine(kind, text.slice(1)));
  }
  return patch.trim() !== '' && lines.length === 0 ? null : lines;
}
function textMessage(unknownBefore: boolean, lines: readonly FileDiffLine[]): string | null {
  if (unknownBefore) return 'Written content · previous content unavailable';
  return lines.every((line) => line.kind === 'context') ? 'No text changes' : null;
}
function textDiff(
  base: ToolFileDiff,
  evidence: Extract<RecordedFile['evidence'], { kind: 'text' | 'patch' }>,
): ToolFileDiff {
  const size = evidenceSize(evidence);
  if (size > SOURCE_CHARACTERS)
    return {
      ...base,
      truncated: true,
      message: 'Recorded change exceeds the inline source limit · open recorded details',
    };
  const lines = evidence.kind === 'patch' ? patched(evidence.patch) : compared(evidence);
  if (lines === null)
    return {
      ...base,
      message:
        'Recorded change could not be compared within the inline limit · open recorded details',
    };
  const hunks = retainDiffHunks(lines, SOURCE_LINES);
  const unknownBefore = evidence.kind === 'text' && evidence.before === null;
  return {
    ...base,
    language: base.language ?? languageOfFirstLine(base.path, lines),
    lines: hunks.changed,
    contextLines: hunks.context,
    displayLimited: hunks.limited,
    added: lines.filter((line) => line.kind === 'add').length,
    removed: unknownBefore ? null : lines.filter((line) => line.kind === 'remove').length,
    truncated: base.truncated,
    message: textMessage(unknownBefore, lines),
    contextRecorded: evidence.kind === 'text' && evidence.fullContext,
  };
}
function normalized(file: RecordedFile): ToolFileDiff {
  const base: ToolFileDiff = {
    path: file.path,
    operation: file.operation,
    lines: [],
    contextLines: [],
    displayLimited: false,
    source: recordedDiffSource(file.evidence),
    language: recordedDiffLanguage(file),
    added: null,
    removed: null,
    truncated: file.truncated,
    message: null,
    contextRecorded: false,
  };
  const evidence = file.evidence;
  if (evidence.kind === 'status') return { ...base, message: evidence.message };
  if (evidence.kind === 'binary')
    return {
      ...base,
      message: `Binary file changed${evidence.size === null ? '' : ` · ${String(evidence.size)} bytes`}`,
    };
  return textDiff(base, evidence);
}
export function toolFileDiffs(tool: FileToolEvidence): readonly ToolFileDiff[] {
  return recordedFiles(tool).map(normalized);
}
export function visibleDiffLines(
  diff: ToolFileDiff,
  context: boolean,
  limit: number,
): readonly FileDiffLine[] {
  return (context ? diff.contextLines : diff.lines).slice(0, limit);
}

function evidenceSize(
  evidence: Extract<RecordedFile['evidence'], { kind: 'text' | 'patch' }>,
): number {
  return evidence.kind === 'patch'
    ? evidence.patch.length
    : (evidence.before?.length ?? 0) + evidence.after.length;
}

function languageOfFirstLine(path: string, lines: readonly FileDiffLine[]): string | null {
  const first =
    lines.find((line) => line.newLine === 1) ?? lines.find((line) => line.oldLine === 1);
  return diffLanguage(path, first?.text ?? '');
}
