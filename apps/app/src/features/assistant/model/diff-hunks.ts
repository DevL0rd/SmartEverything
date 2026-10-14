import type { FileDiffLine } from './tool-file-diffs';

const PREVIEW_CONTEXT = 3;
const EXPANDED_CONTEXT = 16;
export interface RetainedDiffHunks {
  readonly changed: readonly FileDiffLine[];
  readonly context: readonly FileDiffLine[];
  readonly limited: boolean;
}
function relevantLines(lines: readonly FileDiffLine[], radius: number): readonly FileDiffLine[] {
  return lines.filter(
    (line, index) =>
      line.kind !== 'context' ||
      lines
        .slice(Math.max(0, index - radius), index + radius + 1)
        .some((nearby) => nearby.kind !== 'context'),
  );
}
export function retainDiffHunks(lines: readonly FileDiffLine[], limit: number): RetainedDiffHunks {
  const changed = relevantLines(lines, PREVIEW_CONTEXT);
  const context = relevantLines(lines, EXPANDED_CONTEXT);
  return {
    changed: changed.slice(0, limit),
    context: context.slice(0, limit),
    limited: changed.length > limit || context.length > limit,
  };
}
