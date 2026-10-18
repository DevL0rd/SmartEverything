import { WAKE_ARBITRATED, type WakeArbitrated } from '@smarteverything/domain';
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONTEST_MS,
  HOLD_MS,
  WakeClaims,
  type WakeClaim,
  type WakeGrant,
  type WakeSource,
} from '../../src/wake-name/wake-claims';
import { FakeClock } from '../support/fake-clock';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';

const START = '2026-10-17T10:00:00.000Z';

let clock: FakeClock;
let claims: WakeClaims;
let logs: CapturedLogs;

beforeEach(() => {
  logs = captureLogs();
  clock = new FakeClock(START);
  claims = new WakeClaims({ clock, log: testLogger('claims') });
});

function after(ms: number): void {
  clock.advanceTo(new Date(Date.parse(START) + ms).toISOString());
}

function claim(source: WakeSource, key: string, snippetDbfs: number): WakeClaim {
  return { source, key, snippetDbfs };
}

function request(
  source: WakeSource,
  key: string,
  snippetDbfs: number,
): { readonly grant: WakeGrant; readonly lost: WakeClaim[] } {
  const grant = claims.request(claim(source, key, snippetDbfs));
  const lost: WakeClaim[] = [];
  grant.onSuperseded((winner) => {
    lost.push(winner);
  });
  return { grant, lost };
}

describe('wake arbiter', () => {
  it('grants the first claim at once', () => {
    expect(request('camera', 'living', -30).grant.granted).toBe(true);
  });

  it('lets a louder camera take over inside the contest window and ends the first conversation', () => {
    const first = request('camera', 'living', -30);
    after(CONTEST_MS - 100);
    const second = request('camera', 'bedroom', -20);
    expect(second.grant.granted).toBe(true);
    expect(first.lost.map((winner) => winner.key)).toEqual(['bedroom']);
    expect(second.lost).toEqual([]);
  });

  it('keeps the holder when the second camera is quieter or equal', () => {
    const first = request('camera', 'living', -30);
    after(200);
    expect(request('camera', 'bedroom', -40).grant.granted).toBe(false);
    after(300);
    expect(request('camera', 'garage', -30).grant.granted).toBe(false);
    expect(first.lost).toEqual([]);
  });

  it('lets a Discord claim beat a louder camera', () => {
    const camera = request('camera', 'living', -10);
    after(300);
    const discord = request('voice_call', 'discord:person', -50);
    expect(discord.grant.granted).toBe(true);
    expect(camera.lost.map((winner) => winner.source)).toEqual(['voice_call']);
  });

  it('never lets a louder camera take over from Discord', () => {
    const discord = request('voice_call', 'discord:person', -50);
    after(300);
    expect(request('camera', 'living', -5).grant.granted).toBe(false);
    expect(discord.lost).toEqual([]);
  });

  it('puts the walkie above cameras and Discord above the walkie, whatever the volume', () => {
    const camera = request('camera', 'living', -10);
    after(100);
    const walkie = request('talk', 'channel', -60);
    expect(walkie.grant.granted).toBe(true);
    expect(camera.lost.map((winner) => winner.source)).toEqual(['talk']);
    after(200);
    expect(request('camera', 'garage', -1).grant.granted).toBe(false);
    const discord = request('voice_call', 'discord:person', -70);
    expect(discord.grant.granted).toBe(true);
    expect(walkie.lost.map((winner) => winner.source)).toEqual(['voice_call']);
  });

  it('lets a louder Discord user take over from another Discord user', () => {
    const first = request('voice_call', 'discord:ann', -35);
    after(400);
    expect(request('voice_call', 'discord:bob', -25).grant.granted).toBe(true);
    expect(first.lost.map((winner) => winner.key)).toEqual(['discord:bob']);
  });

  it('does not let one source supersede itself', () => {
    const first = request('camera', 'living', -30);
    after(100);
    expect(request('camera', 'living', -10).grant.granted).toBe(false);
    expect(first.lost).toEqual([]);
  });

  it('refuses a late claim of the same utterance until the hold ends', () => {
    request('camera', 'living', -30);
    after(CONTEST_MS);
    expect(request('talk', 'channel', -10).grant.granted).toBe(false);
    after(HOLD_MS - 1);
    expect(request('camera', 'bedroom', -5).grant.granted).toBe(false);
  });

  it('lets a Discord claim take over from a camera for the whole hold', () => {
    const camera = request('camera', 'living', -10);
    after(HOLD_MS - 1);
    const discord = request('voice_call', 'discord:person', -70);
    expect(discord.grant.granted).toBe(true);
    expect(camera.lost.map((winner) => winner.source)).toEqual(['voice_call']);
  });

  it('keeps the contest window between two Discord users', () => {
    const first = request('voice_call', 'discord:ann', -35);
    after(CONTEST_MS);
    expect(request('voice_call', 'discord:bob', -25).grant.granted).toBe(false);
    expect(first.lost).toEqual([]);
  });

  it('stops a holder that registers its stop after it was superseded', () => {
    const first = claims.request(claim('camera', 'living', -30));
    after(100);
    claims.request(claim('camera', 'bedroom', -20));
    const lost: WakeClaim[] = [];
    first.onSuperseded((winner) => {
      lost.push(winner);
    });
    expect(lost.map((winner) => winner.key)).toEqual(['bedroom']);
  });

  it('starts a new contest once the hold has ended', () => {
    const first = request('camera', 'living', -30);
    after(HOLD_MS);
    expect(request('camera', 'bedroom', -40).grant.granted).toBe(true);
    expect(first.lost).toEqual([]);
  });

  it('records every claim with its outcome and who decided', () => {
    const records: WakeArbitrated[] = [];
    claims.onArbitrated((record) => {
      records.push(record);
    });
    request('camera', 'living', -30);
    after(250);
    request('camera', 'bedroom', -20);
    after(650);
    request('camera', 'attic', -15);
    after(HOLD_MS);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      at: START,
      winner: claim('camera', 'attic', -15),
      decidedBy: 'loudest',
      claims: [
        { ...claim('camera', 'living', -30), afterMs: 0, outcome: 'superseded' },
        { ...claim('camera', 'bedroom', -20), afterMs: 250, outcome: 'superseded' },
        { ...claim('camera', 'attic', -15), afterMs: 650, outcome: 'won' },
      ],
    });
    expect(WAKE_ARBITRATED.safeParse(records[0]).success).toBe(true);
  });

  it('names the tier that decided a contest', () => {
    const deciders: string[] = [];
    claims.onArbitrated((record) => {
      deciders.push(record.decidedBy);
    });
    const later = (ms: number): void => {
      clock.advanceTo(new Date(clock.now().getTime() + ms).toISOString());
    };
    request('camera', 'living', -30);
    later(HOLD_MS);
    request('camera', 'living', -30);
    later(100);
    request('talk', 'channel', -60);
    later(HOLD_MS);
    request('camera', 'living', -30);
    later(100);
    request('voice_call', 'discord:person', -60);
    later(HOLD_MS);
    expect(deciders).toEqual(['only', 'walkie', 'discord']);
  });

  it('calls a source that claimed twice the only one that heard it', () => {
    const records: WakeArbitrated[] = [];
    claims.onArbitrated((record) => {
      records.push(record);
    });
    request('camera', 'living', -30);
    after(100);
    request('camera', 'living', -20);
    after(HOLD_MS);
    expect(records[0]?.decidedBy).toBe('only');
  });

  it('records a refused claim as stood down', () => {
    const records: WakeArbitrated[] = [];
    claims.onArbitrated((record) => {
      records.push(record);
    });
    request('camera', 'living', -10);
    after(CONTEST_MS + 500);
    request('camera', 'bedroom', -5);
    after(HOLD_MS);
    expect(records[0]?.claims.map((one) => one.outcome)).toEqual(['won', 'stood_down']);
  });

  it('logs one arbitration per contest with every claim and its delay', () => {
    request('camera', 'living', -30);
    after(250);
    request('camera', 'bedroom', -20);
    after(2000);
    request('camera', 'attic', -15);
    after(HOLD_MS + 1000);
    request('camera', 'garage', -10);
    after(HOLD_MS * 3);
    const arbitrated = logs.records.filter((record) => record.event === 'wake.arbitrated');
    expect(arbitrated).toHaveLength(2);
    expect(arbitrated[1]?.payload).toMatchObject({ winner: 'garage' });
    expect(arbitrated[0]?.payload).toMatchObject({
      winner: 'bedroom',
      claims: [
        { source: 'camera', key: 'living', snippetDbfs: -30, afterMs: 0 },
        { source: 'camera', key: 'bedroom', snippetDbfs: -20, afterMs: 250 },
        { source: 'camera', key: 'attic', snippetDbfs: -15, afterMs: 2000 },
      ],
    });
  });

  it('lets a computer beat louder cameras and phones, inside the hold and at any volume', () => {
    const camera = request('camera', 'living', -5);
    after(HOLD_MS - 1);
    const computer = request('computer', 'desk', -90);
    expect(computer.grant.granted).toBe(true);
    expect(camera.lost.map((winner) => winner.source)).toEqual(['computer']);
    expect(request('phone', 'pixel', -1).grant.granted).toBe(false);
    expect(request('camera', 'garage', -1).grant.granted).toBe(false);
  });

  it('keeps Discord and the walkie above a computer, and the louder of two computers inside the window', () => {
    const computer = request('computer', 'desk', -20);
    after(100);
    expect(request('talk', 'channel', -80).grant.granted).toBe(true);
    expect(computer.lost.map((winner) => winner.source)).toEqual(['talk']);
    after(HOLD_MS + 100);
    const first = request('computer', 'desk', -40);
    after(HOLD_MS + 100 + CONTEST_MS);
    expect(request('computer', 'laptop', -10).grant.granted).toBe(false);
    expect(first.lost).toEqual([]);
  });

  it('leaves the camera path untouched when no computer heard the wake', () => {
    const first = request('camera', 'living', -30);
    after(200);
    expect(request('phone', 'pixel', -20).grant.granted).toBe(true);
    expect(first.lost.map((winner) => winner.source)).toEqual(['phone']);
  });

  it('names a computer win as computer priority', () => {
    const records: WakeArbitrated[] = [];
    claims.onArbitrated((record) => {
      records.push(record);
    });
    request('camera', 'living', -5);
    after(100);
    request('computer', 'desk', -80);
    after(HOLD_MS);
    expect(records.map((record) => record.decidedBy)).toEqual(['computer']);
  });

  it('always gives the call to a computer that heard the wake, whoever else did and however loud', () => {
    const lower = fc.constantFrom<WakeSource>('camera', 'phone');
    const level = fc.integer({ min: -120, max: 0 });
    fc.assert(
      fc.property(
        fc.array(fc.tuple(lower, level), { minLength: 1, maxLength: 5 }),
        level,
        fc.integer({ min: 0, max: HOLD_MS - 1 }),
        (heard, computerLevel, lateMs) => {
          const local = new FakeClock(START);
          const arbiter = new WakeClaims({ clock: local, log: testLogger('claims') });
          heard.forEach(([source, dbfs], index) => {
            arbiter.request(claim(source, `${source}${String(index)}`, dbfs));
          });
          local.advanceTo(new Date(Date.parse(START) + lateMs).toISOString());
          return arbiter.request(claim('computer', 'desk', computerLevel)).granted;
        },
      ),
    );
  });
});
