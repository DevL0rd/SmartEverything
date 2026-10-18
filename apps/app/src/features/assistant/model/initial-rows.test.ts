import { describe, expect, it } from 'vitest';
import { estimatedRowHeight, initialRowCount, type RowShape } from './initial-rows';

const short: RowShape = { text: 'ok', attachments: 0, embeds: 0 };
const long: RowShape = { text: 'word '.repeat(300), attachments: 0, embeds: 0 };
const table: RowShape = {
  text: ['| a | b |', '|---|---|', '| 1 | 2 |', '| 3 | 4 |'].join('\n'),
  attachments: 0,
  embeds: 0,
};

describe('initialRowCount', () => {
  it('renders more rows when messages are short', () => {
    const rows = Array.from({ length: 40 }, () => short);
    expect(initialRowCount(rows, 900)).toBe(6);
  });

  it('renders few rows when the newest messages are tall', () => {
    const rows = Array.from({ length: 40 }, () => long);
    expect(initialRowCount(rows, 900)).toBe(3);
  });

  it('never goes below the floor or above the ceiling', () => {
    expect(initialRowCount([], 900)).toBe(3);
    expect(initialRowCount([long], 900)).toBe(3);
    expect(
      initialRowCount(
        Array.from({ length: 200 }, () => short),
        5000,
      ),
    ).toBe(6);
  });

  it('counts table lines, attachments and embeds as taller than plain text', () => {
    expect(estimatedRowHeight(table)).toBeGreaterThan(estimatedRowHeight(short) + 100);
    expect(estimatedRowHeight({ ...short, attachments: 1 })).toBeGreaterThan(
      estimatedRowHeight(short),
    );
    expect(estimatedRowHeight({ ...short, embeds: 1 })).toBeGreaterThan(estimatedRowHeight(short));
  });

  it('is stable for a mixed thread', () => {
    const rows = [short, long, short, table, short, short, long];
    expect(initialRowCount(rows, 900)).toBe(initialRowCount(rows, 900));
    expect(initialRowCount(rows, 900)).toBeLessThanOrEqual(7);
  });
});
