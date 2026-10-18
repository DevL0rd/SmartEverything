import { graphemeCount } from '../../model/stream-fade';
import type { Block, Inline } from './parse';

const known = new WeakMap<readonly Block[], number>();

export function inlineLength(inline: readonly Inline[]): number {
  return inline.reduce((sum, part) => sum + graphemeCount(part.text), 0);
}

export function blockLength(block: Block): number {
  switch (block.kind) {
    case 'paragraph':
    case 'heading':
    case 'quote':
      return inlineLength(block.inline);
    case 'list':
      return block.items.reduce((sum, item) => sum + inlineLength(item), 0);
    case 'code':
    case 'table':
      return 0;
  }
}

export function renderedLength(blocks: readonly Block[]): number {
  const cached = known.get(blocks);
  if (cached !== undefined) return cached;
  const length = blocks.reduce((sum, block) => sum + blockLength(block), 0);
  known.set(blocks, length);
  return length;
}

export function startsFrom(lengths: readonly number[], first: number): readonly number[] {
  const starts: number[] = [];
  lengths.reduce((position, length) => {
    starts.push(position);
    return position + length;
  }, first);
  return starts;
}

export function startsOf(texts: readonly string[], first: number): readonly number[] {
  return startsFrom(texts.map(graphemeCount), first);
}
