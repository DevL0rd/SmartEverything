import { describe, expect, it } from 'vitest';
import type { Cancel } from '../../src/clock';
import { OPUS_SILENCE, SpeakerPacer } from '../../src/reach/voice-pacing';

class LateClock {
  private time = 0;
  private readonly due: { at: number; action: () => void }[] = [];

  constructor(private readonly lateness: number) {}

  now = (): Date => new Date(this.time);

  at = (moment: Date, action: () => void): Cancel => {
    const entry = { at: moment.getTime() + this.lateness, action };
    this.due.push(entry);
    return (): void => {
      this.due.splice(this.due.indexOf(entry), 1);
    };
  };

  advance(ms: number): void {
    const end = this.time + ms;
    for (let next = this.first(); next !== undefined && next.at <= end; next = this.first()) {
      this.due.splice(this.due.indexOf(next), 1);
      this.time = next.at;
      next.action();
    }
    this.time = end;
  }

  private first(): { at: number; action: () => void } | undefined {
    return this.due.sort((left, right) => left.at - right.at)[0];
  }
}

const speech = Uint8Array.of(1, 2, 3);

function counted(lateness: number, run: (clock: LateClock, pacer: SpeakerPacer) => void): number {
  const clock = new LateClock(lateness);
  let frames = 0;
  const pacer = new SpeakerPacer(
    clock,
    () => {
      frames += 1;
    },
    { idle: OPUS_SILENCE, spoke: (): void => undefined },
  );
  run(clock, pacer);
  pacer.stop();
  return frames;
}

describe('SpeakerPacer timing', () => {
  it('sends 50 frames per second when every timer fires 2 ms late', () => {
    expect(
      counted(2, (clock) => {
        clock.advance(1000);
      }),
    ).toBe(50);
  });

  it('does not lose a frame over a long conversation on a late clock', () => {
    expect(
      counted(5, (clock) => {
        clock.advance(10 * 60_000);
      }),
    ).toBe(30_000);
  });

  it('catches up with the frames that are due after a slow tick', () => {
    expect(
      counted(70, (clock) => {
        clock.advance(200);
      }),
    ).toBe(9);
  });

  it('starts a fresh timeline for speech after the pacer went quiet', () => {
    const clock = new LateClock(2);
    let frames = 0;
    const pacer = new SpeakerPacer(clock, () => {
      frames += 1;
    });
    pacer.push(speech);
    pacer.push(speech);
    clock.advance(500);
    expect(frames).toBe(2);
    pacer.push(speech);
    clock.advance(100);
    expect(frames).toBe(3);
  });

  it('skips ahead instead of bursting after a long stall', () => {
    const clock = new LateClock(5000);
    let frames = 0;
    const pacer = new SpeakerPacer(
      clock,
      () => {
        frames += 1;
      },
      { idle: OPUS_SILENCE, spoke: (): void => undefined },
    );
    clock.advance(5100);
    expect(frames).toBeLessThan(10);
    pacer.stop();
  });
});

class StalledClock {
  private time = 0;
  private readonly due: { at: number; action: () => void }[] = [];

  constructor(
    private readonly stallFrom: number,
    private readonly stallUntil: number,
  ) {}

  now = (): Date => new Date(this.time);

  at = (moment: Date, action: () => void): Cancel => {
    const wanted = moment.getTime();
    const at = wanted >= this.stallFrom && wanted < this.stallUntil ? this.stallUntil : wanted;
    const entry = { at, action };
    this.due.push(entry);
    return (): void => {
      this.due.splice(this.due.indexOf(entry), 1);
    };
  };

  advance(ms: number): void {
    const end = this.time + ms;
    for (let next = this.first(); next !== undefined && next.at <= end; next = this.first()) {
      this.due.splice(this.due.indexOf(next), 1);
      this.time = Math.max(this.time, next.at);
      next.action();
    }
    this.time = end;
  }

  private first(): { at: number; action: () => void } | undefined {
    return this.due.sort((left, right) => left.at - right.at)[0];
  }
}

function gapsAfterStall(leadMs: number | undefined, stallMs: number): number {
  const clock = new StalledClock(200, 200 + stallMs);
  const sentAt: number[] = [];
  const pacer = new SpeakerPacer(
    clock,
    () => {
      sentAt.push(clock.now().getTime());
    },
    {
      idle: null,
      spoke: (): void => undefined,
      ...(leadMs === undefined ? {} : { leadMs }),
    },
  );
  for (let frame = 0; frame < 150; frame += 1) {
    pacer.push(speech);
  }
  clock.advance(10_000);
  let playedUntil = sentAt[0] ?? 0;
  let gapMs = 0;
  for (const at of sentAt) {
    gapMs += Math.max(0, at - playedUntil);
    playedUntil = Math.max(at, playedUntil) + 20;
  }
  return gapMs;
}

describe('SpeakerPacer under a stalled event loop', () => {
  it('plays without any gap through a 500 ms stall of the hub, because audio is sent ahead of real time', () => {
    expect(gapsAfterStall(undefined, 500)).toBe(0);
  });

  it('plays without any gap through a 300 ms stall for every lead of at least 300 ms', () => {
    expect(gapsAfterStall(300, 250)).toBe(0);
  });

  it('would gap through the same stall without the lead, proving the lead is what rides it out', () => {
    expect(gapsAfterStall(20, 500)).toBeGreaterThan(0);
  });

  it('never queues more than the lead ahead of the speaker, so a cut leaves at most that tail', () => {
    const clock = new LateClock(0);
    const sent: number[] = [];
    const pacer = new SpeakerPacer(
      clock,
      () => {
        sent.push(clock.now().getTime());
      },
      { idle: null, spoke: (): void => undefined, leadMs: 200 },
    );
    for (let frame = 0; frame < 100; frame += 1) {
      pacer.push(speech);
    }
    expect(sent).toHaveLength(10);
    pacer.stop();
  });
});
