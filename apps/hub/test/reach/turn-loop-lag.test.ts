import { describe, expect, it } from 'vitest';
import type { Cancel } from '../../src/clock';
import { SpeakerPacer, type TurnStats } from '../../src/reach/voice-pacing';

const STALL_MS = 150;
const SETTLE_MS = 40;
const SEEN_MS = STALL_MS - 40;
const packet = Uint8Array.of(1, 2, 3);

class ManualClock {
  private time = 0;
  private readonly due: { at: number; action: () => void }[] = [];

  now = (): Date => new Date(this.time);

  at = (moment: Date, action: () => void): Cancel => {
    const entry = { at: moment.getTime(), action };
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

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
}

function stall(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const until = performance.now() + STALL_MS;
      while (performance.now() < until) {
        continue;
      }
      resolve();
    }, 0);
  });
}

function line(clock: ManualClock): { pacer: SpeakerPacer; turns: TurnStats[] } {
  const turns: TurnStats[] = [];
  const pacer = new SpeakerPacer(clock, () => undefined, {
    idle: null,
    spoke: (_frames, stats): void => {
      turns.push(stats);
    },
  });
  return { pacer, turns };
}

describe('loop lag of a spoken turn', () => {
  it('reports a stall that happened while the turn was speaking', async () => {
    const clock = new ManualClock();
    const { pacer, turns } = line(clock);
    pacer.push(packet);
    await settle();
    await stall();
    await settle();
    clock.advance(100);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.loopLagMaxMs).toBeGreaterThanOrEqual(SEEN_MS);
  });

  it('does not blame a turn for a stall in the idle time before its first frame', async () => {
    const clock = new ManualClock();
    const { pacer, turns } = line(clock);
    await stall();
    await settle();
    pacer.push(packet);
    await settle();
    clock.advance(100);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.loopLagMaxMs).toBeLessThan(SEEN_MS);
  });

  it('gives overlapping lines only the stalls inside their own turn', async () => {
    const clock = new ManualClock();
    const early = line(clock);
    const late = line(clock);
    early.pacer.push(packet);
    await settle();
    clock.advance(100);
    late.pacer.push(packet);
    await settle();
    await stall();
    await settle();
    clock.advance(100);
    expect(early.turns[0]?.loopLagMaxMs).toBeLessThan(SEEN_MS);
    expect(late.turns[0]?.loopLagMaxMs).toBeGreaterThanOrEqual(SEEN_MS);
  });

  it('reports a stall to every line speaking through it', async () => {
    const clock = new ManualClock();
    const first = line(clock);
    const second = line(clock);
    first.pacer.push(packet);
    second.pacer.push(packet);
    await settle();
    await stall();
    await settle();
    clock.advance(100);
    expect(first.turns[0]?.loopLagMaxMs).toBeGreaterThanOrEqual(SEEN_MS);
    expect(second.turns[0]?.loopLagMaxMs).toBeGreaterThanOrEqual(SEEN_MS);
  });

  it('starts the next turn of a line with an empty window', async () => {
    const clock = new ManualClock();
    const { pacer, turns } = line(clock);
    pacer.push(packet);
    await settle();
    await stall();
    await settle();
    clock.advance(100);
    pacer.push(packet);
    await settle();
    clock.advance(100);
    expect(turns).toHaveLength(2);
    expect(turns[1]?.loopLagMaxMs).toBeLessThan(SEEN_MS);
  });

  it('measures nothing for a turn that was stopped', async () => {
    const clock = new ManualClock();
    const { pacer, turns } = line(clock);
    pacer.push(packet);
    pacer.stop();
    await stall();
    await settle();
    clock.advance(100);
    expect(turns).toHaveLength(0);
  });
});
