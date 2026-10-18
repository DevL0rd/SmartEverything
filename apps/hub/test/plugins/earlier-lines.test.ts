import { describe, expect, it } from 'vitest';
import { EARLIER_BLOCK_CHARS, earlierBlock } from '../../src/plugins/earlier-lines';

const NOW = new Date('2026-10-18T12:00:00.000Z');

function row(at: string, text: string): { readonly at: string; readonly text: string } {
  return { at, text };
}

describe('the earlier-conversation block', () => {
  it('cuts one very long line instead of carrying it whole', () => {
    const block = earlierBlock([row('2026-10-18T11:00:00.000Z', 'x'.repeat(30_000))], 40, NOW);
    expect(block?.length).toBeLessThan(1000);
    expect(block).toContain('…');
  });

  it('keeps the newest lines when the block is over its size', () => {
    const rows = Array.from({ length: 100 }, (_, index) =>
      row(
        `2026-10-18T11:${String(index % 60).padStart(2, '0')}:00.000Z`,
        `line ${String(index)} ${'y'.repeat(380)}`,
      ),
    );
    const block = earlierBlock(rows.reverse(), 200, NOW) ?? '';
    expect(block.length).toBeLessThanOrEqual(EARLIER_BLOCK_CHARS + 200);
    expect(block).toContain('line 99 ');
    expect(block).not.toContain('line 0 ');
  });

  it('is empty when nothing was said', () => {
    expect(earlierBlock([], 40, NOW)).toBeNull();
  });
});
