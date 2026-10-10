const FENCE_LINE = /^\s*```/;
const FENCE_CLOSE = '\n```';
const SEPARATORS = ['\n\n', '\n', ' '] as const;
const MIN_CUT_SHARE = 0.3;
const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;

const MESSAGE_LIMIT = 2000;

interface Cut {
  readonly end: number;
  readonly skip: number;
}

interface Piece {
  readonly piece: string;
  readonly skip: number;
  readonly open: string | undefined;
}

function fenceAfter(open: string | undefined, text: string): string | undefined {
  let fence = open;
  for (const line of text.split('\n')) {
    if (FENCE_LINE.test(line)) {
      fence = fence === undefined ? line.trim() : undefined;
    }
  }
  return fence;
}

function cutAt(text: string, budget: number): Cut {
  const window = text.slice(0, budget + 1);
  for (const separator of SEPARATORS) {
    const index = window.lastIndexOf(separator);
    if (index > 0 && index >= budget * MIN_CUT_SHARE) {
      return { end: index, skip: separator.length };
    }
  }
  const code = text.charCodeAt(budget - 1);
  const splitsPair = budget > 1 && code >= HIGH_SURROGATE_START && code <= HIGH_SURROGATE_END;
  return { end: splitsPair ? budget - 1 : budget, skip: 0 };
}

function nextPiece(text: string, fence: string | undefined, room: number): Piece {
  const whole = cutAt(text, room);
  const open = fenceAfter(fence, text.slice(0, whole.end));
  if (open === undefined) {
    return { piece: text.slice(0, whole.end), skip: whole.skip, open: undefined };
  }
  const budget = room - FENCE_CLOSE.length;
  if (budget < 1) {
    throw new RangeError('The message limit is too small for its code fence');
  }
  const fenced = cutAt(text, budget);
  const piece = text.slice(0, fenced.end);
  return { piece, skip: fenced.skip, open: fenceAfter(fence, piece) };
}

export function splitMessage(text: string, limit = MESSAGE_LIMIT): string[] {
  const chunks: string[] = [];
  let rest = text;
  let fence: string | undefined;
  while (rest !== '') {
    const prefix = fence === undefined ? '' : `${fence}\n`;
    if (prefix.length + rest.length <= limit) {
      chunks.push(prefix + rest);
      break;
    }
    const { piece, skip, open } = nextPiece(rest, fence, limit - prefix.length);
    fence = open;
    chunks.push(`${prefix}${piece}${fence === undefined ? '' : FENCE_CLOSE}`);
    rest = rest.slice(piece.length + skip);
  }
  return chunks;
}
