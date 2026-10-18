import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_DELAY_MS, HoldRepeat, REPEAT_MS } from './hold-repeat';

function setup(rate: number | null): {
  readonly hold: HoldRepeat;
  readonly fire: ReturnType<typeof vi.fn>;
  readonly held: ReturnType<typeof vi.fn>;
  readonly watching: () => number;
  readonly background: () => void;
} {
  const fire = vi.fn();
  const held = vi.fn();
  let listeners: (() => void)[] = [];
  const hold = new HoldRepeat({
    fire,
    rateMs: (): number | null => rate,
    held,
    watchBackground: (onBackground) => {
      listeners.push(onBackground);
      return (): void => {
        listeners = listeners.filter((entry) => entry !== onBackground);
      };
    },
  });
  return {
    hold,
    fire,
    held,
    watching: (): number => listeners.length,
    background: (): void => {
      listeners.forEach((entry) => {
        entry();
      });
    },
  };
}

describe('television hold to repeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends nothing on touch down so a scroll that starts on a key sends no key', () => {
    const { hold, fire } = setup(REPEAT_MS.smartthings);
    hold.pressIn();
    hold.pressOut();
    vi.advanceTimersByTime(5000);
    expect(fire).not.toHaveBeenCalled();
  });

  it('sends once when a quick tap is released', () => {
    const { hold, fire } = setup(REPEAT_MS.smartthings);
    hold.pressIn();
    hold.pressOut();
    hold.press();
    vi.advanceTimersByTime(5000);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('sends the first command when the hold delay elapses, then repeats at the path rate', () => {
    const { hold, fire, held } = setup(REPEAT_MS.direct);
    hold.pressIn();
    vi.advanceTimersByTime(HOLD_DELAY_MS - 1);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(held).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(REPEAT_MS.direct * 4);
    expect(fire).toHaveBeenCalledTimes(5);
  });

  it('does not send again on the release that ends a hold', () => {
    const { hold, fire } = setup(REPEAT_MS.direct);
    hold.pressIn();
    vi.advanceTimersByTime(HOLD_DELAY_MS + REPEAT_MS.direct);
    hold.pressOut();
    const sent = fire.mock.calls.length;
    hold.press();
    vi.advanceTimersByTime(5000);
    expect(fire).toHaveBeenCalledTimes(sent);
  });

  it('repeats slower over the cloud than over the direct link', () => {
    const cloud = setup(REPEAT_MS.smartthings);
    const direct = setup(REPEAT_MS.direct);
    cloud.hold.pressIn();
    direct.hold.pressIn();
    vi.advanceTimersByTime(HOLD_DELAY_MS + 1200);
    expect(cloud.fire.mock.calls.length).toBeLessThan(direct.fire.mock.calls.length);
  });

  it('stops repeating when the first failed send asks to stop', () => {
    const { hold, fire } = setup(REPEAT_MS.direct);
    fire.mockImplementation((stop: () => void) => {
      stop();
    });
    hold.pressIn();
    vi.advanceTimersByTime(HOLD_DELAY_MS + REPEAT_MS.direct * 10);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('stops on cancel and when the app goes to the background', () => {
    const { hold, fire, background, watching } = setup(REPEAT_MS.direct);
    hold.pressIn();
    vi.advanceTimersByTime(HOLD_DELAY_MS + REPEAT_MS.direct);
    const sent = fire.mock.calls.length;
    background();
    vi.advanceTimersByTime(5000);
    expect(fire).toHaveBeenCalledTimes(sent);
    expect(watching()).toBe(0);
  });

  it('listens for the background only while a repeating key is held', () => {
    const { hold, watching } = setup(REPEAT_MS.smartthings);
    expect(watching()).toBe(0);
    hold.pressIn();
    expect(watching()).toBe(1);
    hold.pressOut();
    expect(watching()).toBe(0);
  });

  it('does not repeat or listen for keys that have no repeat rate', () => {
    const { hold, fire, held, watching } = setup(null);
    hold.pressIn();
    expect(watching()).toBe(0);
    hold.pressOut();
    hold.press();
    vi.advanceTimersByTime(5000);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(held).not.toHaveBeenCalled();
  });

  it('sends once for a click that never touched down, like a screen reader', () => {
    const { hold, fire } = setup(REPEAT_MS.smartthings);
    hold.press();
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('forgets a hold that slid off so the next screen reader click still sends', () => {
    const { hold, fire } = setup(REPEAT_MS.smartthings);
    hold.pressIn();
    vi.advanceTimersByTime(HOLD_DELAY_MS);
    hold.cancel();
    const sent = fire.mock.calls.length;
    hold.press();
    expect(fire).toHaveBeenCalledTimes(sent + 1);
  });
});
