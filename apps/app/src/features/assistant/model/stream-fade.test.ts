import { describe, expect, it } from 'vitest';
import {
  FADE_MS,
  MAX_SLICES,
  SPREAD_MS,
  elapsedMs,
  arrive,
  batchesWithin,
  graphemeCount,
  graphemesOf,
  holdLedger,
  piecesOf,
  settledLedger,
  type Ledger,
} from './stream-fade';

describe('graphemesOf', () => {
  it('splits plain text into single letters that rejoin exactly', () => {
    expect(graphemesOf('Hello, world')).toHaveLength(12);
    expect(graphemesOf('Hello, world').join('')).toBe('Hello, world');
  });

  it('keeps multi-byte emoji, flags, joined families and skin tones whole', () => {
    expect(graphemesOf('a😀b')).toEqual(['a', '😀', 'b']);
    expect(graphemesOf('🇩🇪🇫🇷')).toEqual(['🇩🇪', '🇫🇷']);
    expect(graphemesOf('👨‍👩‍👧‍👦!')).toEqual(['👨‍👩‍👧‍👦', '!']);
    expect(graphemesOf('👍🏽x')).toEqual(['👍🏽', 'x']);
    expect(graphemesOf('❤️.')).toEqual(['❤️', '.']);
  });

  it('keeps combining marks, CRLF and non-Latin clusters together', () => {
    expect(graphemesOf('éx')).toEqual(['é', 'x']);
    expect(graphemesOf('a\r\nb')).toEqual(['a', '\r\n', 'b']);
    const hindi = '\u0928\u092e\u0938\u094d\u0924\u0947';
    expect(graphemesOf(hindi).join('')).toBe(hindi);
    expect(graphemeCount(hindi)).toBe(4);
    expect(graphemeCount('日本語')).toBe(3);
    expect(graphemeCount('')).toBe(0);
  });
});

function feed(texts: readonly string[], times: readonly number[]): readonly Ledger[] {
  let ledger = settledLedger(0);
  let total = 0;
  return texts.map((text, index) => {
    total += graphemeCount(text);
    ledger = arrive(ledger, total, times[index] ?? 0);
    return ledger;
  });
}

describe('arrive', () => {
  it('splits a burst into a few slices whose starts spread across one flush interval', () => {
    const [ledger] = feed(['x'.repeat(120)], [1000]);
    expect(ledger?.batches).toEqual([
      { id: 0, from: 0, to: 40, at: 1000 },
      { id: 1, from: 40, to: 80, at: 1027 },
      { id: 2, from: 80, to: 120, at: 1053 },
    ]);
  });

  it('keeps tiny deltas as one batch starting at arrival', () => {
    const [ledger] = feed(['Hi'], [500]);
    expect(ledger?.batches).toEqual([{ id: 0, from: 0, to: 2, at: 500 }]);
  });

  it('covers every new letter exactly once, in order, never starting before arrival or after the spread', () => {
    const deltas = ['Hel', 'lo wor', '😀 and some more words', ' wor', 'ld 🇩🇪', '!'];
    const times = [10, 55, 130, 131, 300, 900];
    const ledgers = feed(deltas, times);
    let from = 0;
    deltas.forEach((delta, step) => {
      const count = graphemeCount(delta);
      const arrived = ledgers[step]?.batches.filter((batch) => batch.from >= from) ?? [];
      const at = times[step] ?? 0;
      expect(arrived[0]?.from).toBe(from);
      expect(arrived.at(-1)?.to).toBe(from + count);
      arrived.forEach((batch, index) => {
        expect(batch.at).toBeGreaterThanOrEqual(at);
        expect(batch.at).toBeLessThan(at + SPREAD_MS);
        expect(batch.from).toBe(index === 0 ? from : arrived[index - 1]?.to);
      });
      from += count;
    });
  });

  it('keeps cost flat: live batches stay bounded however long the stream runs', () => {
    let ledger = settledLedger(0);
    let peak = 0;
    for (let step = 1; step <= 500; step += 1) {
      ledger = arrive(ledger, step * 40, step * 80);
      peak = Math.max(peak, ledger.batches.length);
    }
    expect(peak).toBeLessThanOrEqual(MAX_SLICES * Math.ceil((FADE_MS + SPREAD_MS) / 80));
    expect(ledger.batches.every((batch) => 40_000 - batch.at < FADE_MS)).toBe(true);
  });

  it('leaves nothing to animate once the stream stops and the fades finish', () => {
    const ledger = arrive(settledLedger(0), 10, 100);
    const later = arrive(ledger, 10, 100 + FADE_MS + SPREAD_MS);
    expect(later.batches).toEqual([]);
  });

  it('clips batches when the rendered text shrinks and fades only new letters after', () => {
    let ledger = arrive(settledLedger(0), 10, 0);
    ledger = arrive(ledger, 8, 10);
    expect(ledger.batches.at(-1)?.to).toBe(8);
    ledger = arrive(ledger, 11, 20);
    expect(ledger.batches.at(-1)).toMatchObject({ from: 8, to: 11, at: 20 });
  });
});

describe('elapsedMs', () => {
  it('is negative before a staggered slice starts so the span waits', () => {
    expect(elapsedMs({ id: 0, from: 0, to: 3, at: 1060 }, 1000)).toBe(-60);
  });
});

describe('holdLedger', () => {
  it('shows new text at once without adding a batch and keeps running fades', () => {
    const running = arrive(settledLedger(0), 5, 0);
    const held = holdLedger(running, 9);
    expect(held.total).toBe(9);
    expect(held.batches).toEqual(running.batches);
  });
});

describe('piecesOf and batchesWithin', () => {
  it('splits a text run into settled and fading letters by arrival', () => {
    const ledger = arrive(settledLedger(4), 8, 50);
    const batches = ledger.batches;
    const pieces = piecesOf('abcdefgh', 0, batches);
    expect(pieces.map((piece) => piece.text)).toEqual(['abcd', 'efgh']);
    expect(pieces[0]?.batch).toBeNull();
    expect(pieces[1]?.batch?.at).toBe(50);
  });

  it('keeps emoji whole across pieces and honours the run offset', () => {
    const ledger = arrive(settledLedger(3), 5, 7);
    const pieces = piecesOf('a😀🇩🇪', 2, ledger.batches);
    expect(pieces.map((piece) => piece.text)).toEqual(['a', '😀🇩🇪']);
    expect(pieces.map((piece) => piece.text).join('')).toBe('a😀🇩🇪');
  });

  it('reports no batches outside the fading window', () => {
    const ledger = arrive(settledLedger(10), 12, 5);
    expect(batchesWithin(ledger, 0, 10)).toBeNull();
    expect(batchesWithin(ledger, 8, 20)).toHaveLength(1);
  });
});
