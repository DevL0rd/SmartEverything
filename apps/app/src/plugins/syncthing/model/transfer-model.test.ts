import { describe, expect, it } from 'vitest';
import { hasTransfer, transferSummary } from './transfer-model';

const at = (hour: number): number =>
  Date.parse(`2026-10-17T${String(hour).padStart(2, '0')}:00:00Z`);

describe('hasTransfer', () => {
  it('stays hidden until a line can be drawn', () => {
    expect(hasTransfer([], [])).toBe(false);
    expect(hasTransfer([{ t: at(1), v: 5 }], [{ t: at(1), v: 5 }])).toBe(false);
    expect(
      hasTransfer(
        [
          { t: at(1), v: 5 },
          { t: at(2), v: 6 },
        ],
        [],
      ),
    ).toBe(true);
  });
});

describe('transferSummary', () => {
  it('has nothing to say without readings', () => {
    expect(transferSummary([], [])).toBeNull();
  });

  it('names the peak and the latest rates', () => {
    const summary = transferSummary(
      [
        { t: at(1), v: 5_000_000 },
        { t: at(2), v: 1_000_000 },
      ],
      [{ t: at(2), v: 200_000 }],
    );
    expect(summary).toContain('peaked at 5.0 MB/s');
    expect(summary).toContain('now 1.0 MB/s');
    expect(summary).toContain('Outgoing now 200 kB/s');
  });
});
