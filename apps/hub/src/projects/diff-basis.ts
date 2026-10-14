import { AI_PROJECT_CHUNK_BYTES } from '@smarteverything/domain';
const CONTEXT_CHARACTERS = 1024;
export function projectDiffBasis(
  before: string | null,
  after: string,
  beforeTruncated = false,
): {
  readonly before: string | null;
  readonly after: string;
  readonly start_line: number;
  readonly truncated: boolean;
} {
  if (before === null)
    return {
      before: null,
      after: boundedText(after),
      start_line: 1,
      truncated: beforeTruncated || Buffer.byteLength(after) > AI_PROJECT_CHUNK_BYTES,
    };
  if (
    Buffer.byteLength(before) <= AI_PROJECT_CHUNK_BYTES &&
    Buffer.byteLength(after) <= AI_PROJECT_CHUNK_BYTES
  )
    return { before, after, start_line: 1, truncated: beforeTruncated };
  let same = 0;
  while (same < before.length && same < after.length && before[same] === after[same]) same += 1;
  const start = before.lastIndexOf('\n', Math.max(0, same - CONTEXT_CHARACTERS)) + 1;
  const left = boundedText(before.slice(start));
  const right = boundedText(after.slice(start));
  return {
    before: left,
    after: right,
    start_line: lineAt(before, start),
    truncated: beforeTruncated || windowOmitted(before, after, { start, left, right }),
  };
}
function boundedText(text: string): string {
  const bytes = Buffer.from(text.slice(0, AI_PROJECT_CHUNK_BYTES));
  return bytes.length > AI_PROJECT_CHUNK_BYTES
    ? new TextDecoder().decode(bytes.subarray(0, AI_PROJECT_CHUNK_BYTES), { stream: true })
    : text.slice(0, AI_PROJECT_CHUNK_BYTES);
}
function lineAt(text: string, end: number): number {
  let line = 1;
  for (let index = 0; index < end; index += 1) if (text[index] === '\n') line += 1;
  return line;
}

function windowOmitted(
  before: string,
  after: string,
  window: { readonly start: number; readonly left: string; readonly right: string },
): boolean {
  return (
    window.start > 0 ||
    window.start + window.left.length < before.length ||
    window.start + window.right.length < after.length
  );
}
