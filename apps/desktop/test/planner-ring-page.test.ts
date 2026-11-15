import { plannerMathsProblemsOf, plannerMathsSeedOf } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  RING_EVENT_TITLE_PREFIX,
  ringPageEventOf,
  ringPageHtml,
  ringPageView,
} from '../src/planner/ring-page.js';
import { RingScheduler } from '../src/planner/ring-scheduler.js';
import type { RingSoundSource } from '../src/planner/ring-sounds.js';
import type { DesktopRing, RingChoice } from '../src/planner/ring-types.js';

const ALARM = '2c1f0a52-6a7b-4a4a-9f0e-0d4a6b1c2e01';
const TONE: RingSoundSource = { kind: 'tone', reason: null };
const DAY = '2030-01-01';

const alarm: DesktopRing = {
  ringKey: `alarm:${ALARM}`,
  kind: 'alarm',
  refId: ALARM,
  dueAt: '2030-01-01T07:00:00.000Z',
  label: 'Wake up',
  rampSeconds: 30,
  sound: { kind: 'tone', id: 'default' },
  snoozeLimit: 3,
  snoozes: 1,
  challenge: { kind: 'none' },
};

function html(ring: DesktopRing, source: RingSoundSource = TONE): string {
  return ringPageHtml(ringPageView(ring, source, DAY, null));
}

function viewData(page: string): unknown {
  const match = /<script type="application\/json" id="ring-view">(.*?)<\/script>/su.exec(page);
  return JSON.parse(match?.[1] ?? 'null');
}

describe('the planner ring page', () => {
  it('shows the label, snoozes left and a Dismiss button for a plain alarm', () => {
    const page = html(alarm);
    expect(page).toContain('Alarm · Wake up');
    expect(page).toContain('Snooze · 2 left');
    expect(page).toContain('data-choice="dismiss"');
    expect(page).not.toContain('id="maths"');
  });

  it('hides Snooze when no snoozes are left and counts nothing without a limit', () => {
    expect(html({ ...alarm, snoozes: 3 })).not.toContain('data-choice="snooze"');
    expect(html({ ...alarm, snoozes: 3 })).toContain('No snoozes left');
    expect(html({ ...alarm, snoozeLimit: null, snoozes: 9 })).toContain('</svg>Snooze</button>');
  });

  it('asks for the maths problems instead of a Dismiss button', () => {
    const page = html({ ...alarm, challenge: { kind: 'maths', difficulty: 'easy', count: 2 } });
    expect(page).toContain('id="maths"');
    expect(page).toContain('Solve 2 problems to stop the alarm');
    expect(page).not.toContain('data-choice="dismiss"');
    expect(viewData(page)).toMatchObject({
      problems: plannerMathsProblemsOf(plannerMathsSeedOf('alarm', ALARM, DAY), 'easy', 2),
    });
  });

  it('sends QR and steps alarms to the phone and keeps Snooze', () => {
    const qr = html({ ...alarm, challenge: { kind: 'qr', code: 'kitchen' } });
    expect(qr).toContain('Stop it on your phone');
    expect(qr).toContain('QR code');
    expect(qr).not.toContain('kitchen');
    expect(qr).toContain('data-choice="snooze"');
    expect(qr).not.toContain('data-choice="dismiss"');
    const steps = html({ ...alarm, challenge: { kind: 'steps', steps: 40 } });
    expect(steps).toContain('Walk 40 steps with your phone.');
  });

  it('stops a timer with a Stop button and no Snooze', () => {
    const page = html({ ...alarm, ringKey: 'timer:x', kind: 'timer', label: null });
    expect(page).toContain('>Stop</button>');
    expect(page).not.toContain('Snooze');
  });

  it('plays a file or a station and says why when it rings the tone instead', () => {
    const file = html(alarm, { kind: 'file', url: 'file:///sounds/a.mp3', name: 'Morning.mp3' });
    expect(viewData(file)).toMatchObject({ source: { kind: 'file', url: 'file:///sounds/a.mp3' } });
    const reason = 'Morning.mp3 could not be downloaded to this computer.';
    expect(viewData(html(alarm, { kind: 'tone', reason }))).toMatchObject({ source: { reason } });
    const page = html(alarm);
    expect(page).toContain('createOscillator');
    expect(page).toContain("addEventListener('error'");
    expect(page).toContain("addEventListener('stalled'");
  });

  it('keeps the label inert and loads nothing from outside', () => {
    const page = html({ ...alarm, label: '</script><img src=x onerror=alert(1)>' });
    expect(page).not.toContain('<img src=x');
    expect(page).not.toMatch(/<script src|<link /u);
    expect(page).toContain("default-src 'none'");
  });

  it('says which choice did not reach the Hub when it rings again', () => {
    expect(html(alarm)).not.toContain('class="failed"');
    const snooze = ringPageHtml(ringPageView(alarm, TONE, DAY, 'snooze'));
    expect(snooze).toContain(
      '<p class="failed" role="alert">Snooze did not reach the Hub, so the alarm is still ringing. Try again.</p>',
    );
    const timer = { ...alarm, ringKey: 'timer:x', kind: 'timer' as const, label: null };
    expect(ringPageHtml(ringPageView(timer, TONE, DAY, 'dismiss'))).toContain(
      'Stop did not reach the Hub, so the timer is still ringing. Try again.',
    );
  });

  it('reads only its own events from the window title', () => {
    expect(ringPageEventOf(`${RING_EVENT_TITLE_PREFIX}snooze`)).toBe('snooze');
    expect(ringPageEventOf(`${RING_EVENT_TITLE_PREFIX}sound-failed`)).toBe('sound-failed');
    expect(ringPageEventOf(`${RING_EVENT_TITLE_PREFIX}other`)).toBeNull();
    expect(ringPageEventOf('Wake up')).toBeNull();
  });
});

describe('ring choices', () => {
  interface Shown {
    readonly scheduler: RingScheduler;
    readonly choose: (choice: RingChoice) => void;
    readonly shows: () => number;
    readonly failures: () => readonly (RingChoice | null)[];
    readonly close: ReturnType<typeof vi.fn>;
    readonly ringing: ReturnType<typeof vi.fn>;
    readonly outcomes: { dismissed: ReturnType<typeof vi.fn>; snoozed: ReturnType<typeof vi.fn> };
  }

  function shown(ring: DesktopRing, settle: () => Promise<void> = () => Promise.resolve()): Shown {
    const outcomes = {
      dismissed: vi.fn(settle),
      snoozed: vi.fn(settle),
      missed: vi.fn(() => Promise.resolve()),
    };
    const picks: ((choice: RingChoice) => void)[] = [];
    const failed: (RingChoice | null)[] = [];
    const close = vi.fn();
    const ringing = vi.fn();
    const scheduler = new RingScheduler({
      clock: { now: (): Date => new Date(), at: (): (() => void) => (): void => undefined },
      surface: {
        show: (_ring, failure, pick): void => {
          failed.push(failure);
          picks.push(pick);
        },
        focus: vi.fn(),
        close,
      },
      notifier: { ringing, missed: vi.fn() },
      outcomes,
    });
    scheduler.ringNow(ring);
    return {
      scheduler,
      choose: (choice) => picks.at(-1)?.(choice),
      shows: () => picks.length,
      failures: () => failed,
      close,
      ringing,
      outcomes,
    };
  }

  it('refuses a snooze past the limit and a stop the phone must make', () => {
    const spent = shown({ ...alarm, snoozes: 3 });
    spent.choose('snooze');
    expect(spent.outcomes.snoozed).not.toHaveBeenCalled();
    const qr = shown({ ...alarm, challenge: { kind: 'qr', code: 'kitchen' } });
    qr.choose('dismiss');
    expect(qr.outcomes.dismissed).not.toHaveBeenCalled();
    qr.choose('snooze');
    expect(qr.outcomes.snoozed).toHaveBeenCalledOnce();
  });

  it('keeps ringing until the Hub takes the choice, then closes the window', async () => {
    let finish = (): void => undefined;
    const ring = shown(
      alarm,
      () =>
        new Promise<void>((done) => {
          finish = done;
        }),
    );
    ring.choose('dismiss');
    ring.choose('dismiss');
    expect(ring.outcomes.dismissed).toHaveBeenCalledOnce();
    expect(ring.close).not.toHaveBeenCalled();
    expect(ring.scheduler.active()).toEqual([alarm]);
    finish();
    await vi.waitFor(() => {
      expect(ring.close).toHaveBeenCalledWith(alarm.ringKey);
    });
    expect(ring.scheduler.active()).toEqual([]);
  });

  it.each(['snooze', 'dismiss'] as const)(
    'rings again when the Hub refuses a %s and takes the next try',
    async (choice) => {
      const settle = vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(undefined);
      const ring = shown(alarm, settle);
      ring.choose(choice);
      await vi.waitFor(() => {
        expect(ring.shows()).toBe(2);
      });
      expect(ring.close).toHaveBeenCalledOnce();
      expect(ring.ringing).toHaveBeenCalledTimes(2);
      expect(ring.failures()).toEqual([null, choice]);
      expect(ring.scheduler.active()).toEqual([alarm]);
      ring.choose(choice);
      await vi.waitFor(() => {
        expect(ring.close).toHaveBeenCalledTimes(2);
      });
      expect(settle).toHaveBeenCalledTimes(2);
      expect(ring.shows()).toBe(2);
      expect(ring.scheduler.active()).toEqual([]);
    },
  );

  it('drops a late Hub answer for a ring withdrawn meanwhile', async () => {
    let fail = (_cause: Error): void => undefined;
    const ring = shown(
      alarm,
      () =>
        new Promise<void>((_done, reject) => {
          fail = reject;
        }),
    );
    ring.choose('snooze');
    ring.scheduler.withdraw(alarm.ringKey);
    fail(new Error('offline'));
    await Promise.resolve();
    await Promise.resolve();
    expect(ring.shows()).toBe(1);
    expect(ring.scheduler.active()).toEqual([]);
  });
});
