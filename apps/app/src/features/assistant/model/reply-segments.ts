import type { InlineTimelinePart } from './inline-timeline';
import { toolKey } from './tool-presentation-text';

export interface ReplySegment {
  readonly index: number;
  readonly count: number;
  readonly from: number;
  readonly to: number;
}

export const SEGMENT_BUDGET = 75;

const TEXT_BASE = 10;
const TEXT_PER_300_CHARS = 12;
const LIST_OR_TABLE_LINE_WEIGHT = 19;
const CODE_BLOCK_WEIGHT = 60;
const STRUCTURED_LINE = /^\s*(?:[-*•]\s|\d+[.)]\s|\|)/gm;
const FENCE = /^```/gm;
const COLLAPSED_GROUP = 30;
const SINGLE_TOOL = 45;
const SINGLE_FILE_CHANGE = 140;
const FILE_CHANGES: ReadonlySet<string> = new Set([
  'write',
  'write_file',
  'edit',
  'edit_file',
  'apply_patch',
  'file_change',
]);
const REASONING = 30;
const IMAGE = 40;
const STEER = 30;

function textWeight(text: string): number {
  const lines = text.match(STRUCTURED_LINE)?.length ?? 0;
  const codeBlocks = Math.floor((text.match(FENCE)?.length ?? 0) / 2);
  return (
    TEXT_BASE +
    TEXT_PER_300_CHARS * Math.ceil(text.length / 300) +
    LIST_OR_TABLE_LINE_WEIGHT * lines +
    CODE_BLOCK_WEIGHT * codeBlocks
  );
}

function singleWeight(
  tools: Extract<InlineTimelinePart, { readonly kind: 'tools' }>['tools'],
): number {
  const [only] = tools;
  if (tools.length !== 1 || only === undefined) return COLLAPSED_GROUP;
  return FILE_CHANGES.has(toolKey(only.name)) ? SINGLE_FILE_CHANGE : SINGLE_TOOL;
}

export function partWeight(part: InlineTimelinePart): number {
  switch (part.kind) {
    case 'text':
      return textWeight(part.text);
    case 'tools':
      return singleWeight(part.tools);
    case 'reasoning':
      return REASONING;
    case 'image':
      return IMAGE;
    case 'steer':
      return STEER;
  }
}

const SEGMENTS = new WeakMap<readonly InlineTimelinePart[], readonly ReplySegment[]>();

function ranges(parts: readonly InlineTimelinePart[]): readonly (readonly [number, number])[] {
  const result: [number, number][] = [];
  let from = 0;
  let weight = 0;
  parts.forEach((part, index) => {
    const own = partWeight(part);
    if (weight > 0 && weight + own > SEGMENT_BUDGET) {
      result.push([from, index]);
      from = index;
      weight = 0;
    }
    weight += own;
  });
  result.push([from, parts.length]);
  return result;
}

export function replySegments(parts: readonly InlineTimelinePart[]): readonly ReplySegment[] {
  const known = SEGMENTS.get(parts);
  if (known !== undefined) return known;
  const total = parts.reduce((sum, part) => sum + partWeight(part), 0);
  const cut = total <= SEGMENT_BUDGET ? [[0, parts.length] as const] : ranges(parts);
  const segments = cut.map(([from, to], index) => ({ index, count: cut.length, from, to }));
  SEGMENTS.set(parts, segments);
  return segments;
}
