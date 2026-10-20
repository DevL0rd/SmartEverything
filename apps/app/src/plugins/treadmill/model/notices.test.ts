import { describe, expect, it } from 'vitest';
import { noticesOf } from './notices';
import { stateViewFixture } from './fixtures';

describe('what is wrong with the belt, in words', () => {
  it('says nothing for a linked, quiet belt', () => {
    const view = stateViewFixture({});
    expect(noticesOf(view, view.frame.belt)).toEqual([]);
  });

  it('names KS Fit when the vendor app holds the belt', () => {
    const view = stateViewFixture({ phase: 'busy' });
    const [notice] = noticesOf(view, view.frame.belt);
    expect(notice).toMatchObject({ key: 'busy', tone: 'warning', takeOver: false });
    expect(notice?.body).toContain('Close KS Fit');
  });

  it('offers to take the link over only from someone else’s phone', () => {
    const mine = stateViewFixture({ phase: 'lost', holderIsYou: true });
    expect(noticesOf(mine, mine.frame.belt)[0]?.takeOver).toBe(false);
    const theirs = stateViewFixture({
      phase: 'lost',
      holderIsYou: false,
      holderName: 'Alex’s Pixel',
    });
    const [notice] = noticesOf(theirs, theirs.frame.belt);
    expect(notice?.takeOver).toBe(true);
    expect(notice?.body).toContain('Alex’s Pixel');
  });

  it('puts the link first and then the safety stop, the fault, the lost control and the lock', () => {
    const view = stateViewFixture({
      phase: 'searching',
      state: 'safety_stop',
      fault: {
        code: 'E03',
        cause: 'The belt is stuck.',
        tip: 'Switch the power off for ten seconds.',
      },
      controlLost: true,
      childLock: true,
    });
    expect(noticesOf(view, view.frame.belt).map((notice) => notice.key)).toEqual([
      'searching',
      'safety_stop',
      'fault',
      'control_lost',
      'child_lock',
    ]);
    expect(noticesOf(view, view.frame.belt)[2]?.body).toContain('Switch the power off');
  });
});

describe('why the incline did not move', () => {
  it('shows the belt’s own plain line after the safety notices', () => {
    const view = stateViewFixture({ state: 'safety_stop' });
    const keys = noticesOf(
      view,
      view.frame.belt,
      'The incline did not change. Check the belt’s panel.',
    );
    expect(keys.map((notice) => notice.key)).toEqual(['safety_stop', 'incline_failed']);
    expect(keys[1]).toMatchObject({
      tone: 'warning',
      body: 'The incline did not change. Check the belt’s panel.',
    });
  });

  it('says nothing about the incline when the last write worked', () => {
    const view = stateViewFixture({});
    expect(noticesOf(view, view.frame.belt, null)).toEqual([]);
  });
});
