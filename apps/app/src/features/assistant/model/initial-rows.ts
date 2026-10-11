export interface RowShape {
  readonly text: string;
  readonly attachments: number;
  readonly embeds: number;
}

const CHARS_PER_LINE = 40;
const LINE_PX = 24;
const TABLE_LINE_PX = 44;
const FENCE_LINE_PX = 20;
const ROW_PX = 56;
const ATTACHMENT_PX = 200;
const EMBED_PX = 120;
const FILL = 1.3;
const FLOOR = 3;
const CEILING = 10;
const TABLE_LINE = /^\s*\|/;

function textHeight(text: string): number {
  let height = 0;
  let fenced = false;
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      fenced = !fenced;
      height += FENCE_LINE_PX;
    } else if (fenced) {
      height += FENCE_LINE_PX;
    } else if (TABLE_LINE.test(line)) {
      height += TABLE_LINE_PX;
    } else {
      height += Math.max(1, Math.ceil(line.length / CHARS_PER_LINE)) * LINE_PX;
    }
  }
  return height;
}

export function estimatedRowHeight(shape: RowShape): number {
  return (
    ROW_PX + textHeight(shape.text) + shape.attachments * ATTACHMENT_PX + shape.embeds * EMBED_PX
  );
}

export function initialRowCount(shapes: readonly RowShape[], viewport: number): number {
  const wanted = viewport * FILL;
  let filled = 0;
  let count = 0;
  for (const shape of shapes) {
    if (filled >= wanted) {
      break;
    }
    filled += estimatedRowHeight(shape);
    count += 1;
  }
  return Math.min(CEILING, Math.max(FLOOR, count));
}
