import { describe, expect, it } from 'vitest';
import {
  pillWidth,
  pillWindowSize,
  SizeReporter,
  trayWindowSize,
  type WindowSize,
} from '../src/overlay/overlay-width.js';

describe('pill width', () => {
  it('fits the text between the minimum and the maximum of the full pill', () => {
    expect(pillWidth({ mode: 'full', fixed: 200, statusWidth: 60, captionWidth: 20 }).width).toBe(
      200 + 2 + 140,
    );
    expect(pillWidth({ mode: 'full', fixed: 100, statusWidth: 10, captionWidth: 10 }).width).toBe(
      320,
    );
    expect(pillWidth({ mode: 'full', fixed: 200, statusWidth: 900, captionWidth: 900 }).width).toBe(
      640,
    );
  });

  it('flags a caption wider than its column so the page end-aligns it', () => {
    const wide = pillWidth({ mode: 'full', fixed: 200, statusWidth: 60, captionWidth: 800 });
    expect(wide.overCaption).toBe(true);
    expect(wide.column).toBe(640 - 202);
    expect(
      pillWidth({ mode: 'full', fixed: 200, statusWidth: 60, captionWidth: 100 }).overCaption,
    ).toBe(false);
  });

  it('keeps the calm bar between 300 and 520 and clips a long status', () => {
    expect(pillWidth({ mode: 'share', fixed: 100, statusWidth: 20, captionWidth: 0 }).width).toBe(
      300,
    );
    const long = pillWidth({ mode: 'compact', fixed: 200, statusWidth: 600, captionWidth: 0 });
    expect(long.width).toBe(520);
    expect(long.clipStatus).toBe(true);
    expect(long.overCaption).toBe(false);
  });
});

describe('window sizes', () => {
  it('makes the pill window exactly the full pill so no transparent ring takes clicks', () => {
    expect(pillWindowSize(500, 'full')).toEqual({ width: 500, height: 64 });
  });

  it('makes the calm bar window exactly the bar', () => {
    expect(pillWindowSize(400, 'share')).toEqual({ width: 400, height: 44 });
    expect(pillWindowSize(400, 'compact')).toEqual({ width: 400, height: 44 });
  });

  it('makes the tray window exactly the tray or the request card', () => {
    expect(trayWindowSize(403.2)).toEqual({ width: 420, height: 404 });
  });
});

describe('size reporter', () => {
  function reporter(): { sent: WindowSize[]; reporter: SizeReporter } {
    const sent: WindowSize[] = [];
    return {
      sent,
      reporter: new SizeReporter((size) => {
        sent.push(size);
      }),
    };
  }

  it('reports the first size at once', () => {
    const { sent, reporter: size } = reporter();
    size.want({ width: 400, height: 112 }, true);
    expect(sent).toEqual([{ width: 400, height: 112 }]);
  });

  it('grows the window before the content animates', () => {
    const { sent, reporter: size } = reporter();
    size.want({ width: 400, height: 112 }, false);
    size.want({ width: 600, height: 112 }, true);
    expect(sent.at(-1)).toEqual({ width: 600, height: 112 });
  });

  it('shrinks the window only after the width animation settled', () => {
    const { sent, reporter: size } = reporter();
    size.want({ width: 600, height: 112 }, false);
    size.want({ width: 400, height: 112 }, true);
    expect(sent).toEqual([{ width: 600, height: 112 }]);
    size.settled();
    expect(sent.at(-1)).toEqual({ width: 400, height: 112 });
  });

  it('shrinks at once when nothing animates', () => {
    const { sent, reporter: size } = reporter();
    size.want({ width: 600, height: 112 }, false);
    size.want({ width: 400, height: 76 }, false);
    expect(sent.at(-1)).toEqual({ width: 400, height: 76 });
  });

  it('keeps the larger side while one side grows and the other shrinks', () => {
    const { sent, reporter: size } = reporter();
    size.want({ width: 600, height: 76 }, false);
    size.want({ width: 400, height: 112 }, true);
    expect(sent.at(-1)).toEqual({ width: 600, height: 112 });
    size.settled();
    expect(sent.at(-1)).toEqual({ width: 400, height: 112 });
  });

  it('never repeats the same size and forgets a pending shrink on reset', () => {
    const { sent, reporter: size } = reporter();
    size.want({ width: 400, height: 112 }, false);
    size.want({ width: 400, height: 112 }, false);
    size.want({ width: 300, height: 112 }, true);
    size.reset();
    size.settled();
    expect(sent).toEqual([{ width: 400, height: 112 }]);
  });
});
