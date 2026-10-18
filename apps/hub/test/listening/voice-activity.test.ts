import type {
  VoiceActivityNotice,
  VoiceCaptionNotice,
  VoiceLevelsNotice,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  LEVEL_INTERVAL_MS,
  pcmLevel,
  VoiceActivity,
  type VoiceCall,
  type VoiceWatcher,
} from '../../src/listening/voice-activity';

const CALL: VoiceCall = {
  callId: 'call-1',
  device: { kind: 'computer', id: 'kitchen-pc' },
  profileId: 'mina',
};

function loud(level: number): Int16Array {
  return Int16Array.from({ length: 320 }, () => Math.round((level * 32768) / 4));
}

interface Rig {
  readonly activity: VoiceActivity;
  readonly announced: { notice: VoiceActivityNotice; profileId: string | null }[];
  readonly sent: VoiceLevelsNotice[];
  readonly captions: VoiceCaptionNotice[];
  readonly decoded: Uint8Array[];
  readonly watcher: (overrides?: Partial<VoiceWatcher>) => VoiceWatcher;
  readonly advance: (ms: number) => void;
}

function rig(): Rig {
  const announced: { notice: VoiceActivityNotice; profileId: string | null }[] = [];
  let now = 1000;
  const decoded: Uint8Array[] = [];
  const activity = new VoiceActivity({
    announce: (notice, profileId): void => {
      announced.push({ notice, profileId });
    },
    decode: (packet): Int16Array => {
      decoded.push(packet);
      return loud(packet[0] === 1 ? 1 : 0);
    },
    now: (): number => now,
  });
  const sent: VoiceLevelsNotice[] = [];
  const captions: VoiceCaptionNotice[] = [];
  const watcher = (overrides: Partial<VoiceWatcher> = {}): VoiceWatcher => ({
    key: 'socket-1',
    owner: false,
    profileId: 'mina',
    send: (notice): void => {
      if (notice.type === 'voice_caption') {
        captions.push(notice);
      } else {
        sent.push(notice);
      }
    },
    ...overrides,
  });
  return {
    activity,
    announced,
    sent,
    captions,
    decoded,
    watcher,
    advance: (ms: number): void => {
      now += ms;
    },
  };
}

describe('voice activity phases', () => {
  it('announces each new phase of a hosted call with its person and the time', () => {
    const { activity, announced } = rig();
    const tap = activity.begin(CALL);
    tap.phase('connecting');
    tap.phase('listening');
    tap.phase('listening');
    tap.phase('speaking');
    expect(announced.map((entry) => entry.notice.phase)).toEqual([
      'connecting',
      'listening',
      'speaking',
    ]);
    expect(announced[0]).toEqual({
      notice: {
        type: 'voice_activity',
        device: { kind: 'computer', id: 'kitchen-pc' },
        call_id: 'call-1',
        phase: 'connecting',
        muted: false,
        superseded_by: null,
        at: 1000,
      },
      profileId: 'mina',
    });
  });

  it('announces the end once and forgets the call', () => {
    const { activity, announced } = rig();
    const tap = activity.begin(CALL);
    tap.phase('listening');
    tap.end();
    tap.end();
    expect(announced.map((entry) => entry.notice.phase)).toEqual(['listening', 'ended']);
    expect(
      activity.watch({ key: 'a', owner: true, profileId: 'x', send: () => undefined }, 'call-1'),
    ).toBe(false);
  });

  it('keeps a computer without an owner for the owners to hear', () => {
    const { activity, announced } = rig();
    activity.begin({ ...CALL, profileId: null }).phase('listening');
    expect(announced[0]?.profileId).toBeNull();
  });
});

describe('voice activity levels', () => {
  it('measures nothing and decodes nothing while nobody watches', () => {
    const { activity, decoded, sent } = rig();
    const tap = activity.begin(CALL);
    tap.heard(loud(1));
    tap.spoke(Uint8Array.of(1));
    expect(decoded).toHaveLength(0);
    expect(sent).toHaveLength(0);
    expect(activity.watched('call-1')).toBe(false);
  });

  it('sends the microphone level to a watcher at most every 50 ms', () => {
    const { activity, sent, watcher, advance } = rig();
    const tap = activity.begin(CALL);
    expect(activity.watch(watcher(), 'call-1')).toBe(true);
    tap.heard(loud(1));
    advance(LEVEL_INTERVAL_MS / 2);
    tap.heard(loud(0.5));
    expect(sent).toHaveLength(1);
    advance(LEVEL_INTERVAL_MS);
    tap.heard(loud(0.5));
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ type: 'voice_levels', call_id: 'call-1', in: 255, out: 0 });
    expect(sent[1]?.in).toBeGreaterThan(100);
  });

  it('measures the voice the AI plays by decoding its packets', () => {
    const { activity, sent, watcher, decoded, advance } = rig();
    const tap = activity.begin(CALL);
    activity.watch(watcher(), 'call-1');
    tap.phase('speaking');
    advance(LEVEL_INTERVAL_MS);
    tap.spoke(Uint8Array.of(1));
    expect(decoded).toHaveLength(1);
    expect(sent.at(-1)).toMatchObject({ out: 255 });
  });

  it('lets the voice level fall to zero when the packets stop', () => {
    const { activity, sent, watcher, advance } = rig();
    const tap = activity.begin(CALL);
    activity.watch(watcher(), 'call-1');
    tap.phase('speaking');
    tap.spoke(Uint8Array.of(1));
    advance(400);
    tap.heard(loud(0.1));
    expect(sent.at(-1)?.out).toBe(0);
  });

  it('zeroes the voice when the phase leaves speaking', () => {
    const { activity, sent, watcher } = rig();
    const tap = activity.begin(CALL);
    activity.watch(watcher(), 'call-1');
    tap.phase('speaking');
    tap.spoke(Uint8Array.of(1));
    tap.phase('listening');
    expect(sent.at(-1)?.out).toBe(0);
  });

  it('stays quiet while both sides are silent and repeats nothing', () => {
    const { activity, sent, watcher, advance } = rig();
    const tap = activity.begin(CALL);
    activity.watch(watcher(), 'call-1');
    tap.heard(loud(0));
    advance(100);
    tap.heard(loud(0));
    expect(sent).toHaveLength(0);
  });

  it('stops sending when the watcher releases or the call ends', () => {
    const { activity, sent, watcher, advance } = rig();
    const tap = activity.begin(CALL);
    activity.watch(watcher(), 'call-1');
    tap.heard(loud(1));
    activity.release('socket-1');
    advance(100);
    tap.heard(loud(1));
    expect(sent).toHaveLength(1);
    activity.watch(watcher(), 'call-1');
    advance(100);
    tap.end();
    expect(activity.watched('call-1')).toBe(false);
  });

  it('moves a watcher to another call or none', () => {
    const { activity, watcher } = rig();
    activity.begin(CALL);
    activity.begin({ ...CALL, callId: 'call-2' });
    activity.watch(watcher(), 'call-1');
    activity.watch(watcher(), 'call-2');
    expect(activity.watched('call-1')).toBe(false);
    expect(activity.watched('call-2')).toBe(true);
    activity.watch(watcher(), null);
    expect(activity.watched('call-2')).toBe(false);
  });
});

describe('voice activity work per packet', () => {
  it('decodes a played packet only when a level is due and measures the microphone the same way', () => {
    const { activity, decoded, watcher, advance } = rig();
    const tap = activity.begin(CALL);
    activity.watch(watcher(), 'call-1');
    tap.phase('speaking');
    for (let index = 0; index < 10; index++) {
      tap.spoke(Uint8Array.of(1));
      advance(LEVEL_INTERVAL_MS / 5);
    }
    expect(decoded.length).toBeLessThanOrEqual(3);
    expect(decoded.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps one set of watchers per call and drops the call entry when the last one leaves', () => {
    const { activity, watcher } = rig();
    activity.begin(CALL);
    activity.watch(watcher({ key: 'a' }), 'call-1');
    activity.watch(watcher({ key: 'b' }), 'call-1');
    activity.release('a');
    expect(activity.watched('call-1')).toBe(true);
    activity.release('b');
    activity.release('b');
    expect(activity.watched('call-1')).toBe(false);
  });
});

describe('voice activity snapshot', () => {
  it('lists the calls a watcher may see with the phase and the time it began', () => {
    const { activity, watcher, advance } = rig();
    const tap = activity.begin(CALL);
    tap.phase('connecting');
    advance(500);
    tap.phase('listening');
    expect(activity.active(watcher({ owner: true }))).toEqual([
      {
        type: 'voice_activity',
        device: CALL.device,
        call_id: 'call-1',
        phase: 'listening',
        muted: false,
        superseded_by: null,
        at: 1500,
      },
    ]);
  });

  it('leaves out ended calls, calls of other people and calls a member may not see', () => {
    const { activity, watcher } = rig();
    activity.begin(CALL).phase('listening');
    const ended = activity.begin({ ...CALL, callId: 'call-2' });
    ended.phase('listening');
    ended.end();
    activity.begin({ ...CALL, callId: 'call-3', profileId: null }).phase('listening');
    expect(activity.active(watcher({ profileId: 'mina' })).map((notice) => notice.call_id)).toEqual(
      ['call-1'],
    );
    expect(activity.active(watcher({ profileId: 'omar' }))).toEqual([]);
    expect(activity.active(watcher({ owner: true })).map((notice) => notice.call_id)).toEqual([
      'call-1',
      'call-3',
    ]);
  });
});

describe('voice activity scoping', () => {
  it('lets an owner watch any call', () => {
    const { activity, watcher } = rig();
    activity.begin(CALL);
    expect(activity.watch(watcher({ owner: true, profileId: 'someone-else' }), 'call-1')).toBe(
      true,
    );
  });

  it('lets a member watch only the calls on its own computers', () => {
    const { activity, watcher } = rig();
    activity.begin(CALL);
    expect(activity.watch(watcher({ profileId: 'mina' }), 'call-1')).toBe(true);
    expect(activity.watch(watcher({ profileId: 'omar' }), 'call-1')).toBe(false);
    expect(activity.watched('call-1')).toBe(false);
  });

  it('keeps a call on a computer without an owner away from members', () => {
    const { activity, watcher } = rig();
    activity.begin({ ...CALL, profileId: null });
    expect(activity.watch(watcher({ profileId: 'mina' }), 'call-1')).toBe(false);
  });

  it('refuses a call that does not exist', () => {
    const { activity, watcher } = rig();
    expect(activity.watch(watcher({ owner: true }), 'missing')).toBe(false);
  });
});

describe('pcm level', () => {
  it('uses the same loudness formula as the engines', () => {
    expect(pcmLevel(new Int16Array(0))).toBe(0);
    expect(pcmLevel(new Int16Array(100))).toBe(0);
    expect(pcmLevel(Int16Array.from({ length: 100 }, () => 32767))).toBe(1);
    expect(pcmLevel(Int16Array.from({ length: 100 }, () => 4096))).toBeCloseTo(0.5, 2);
  });
});

describe('voice activity captions and mute', () => {
  it('sends what was heard, said and run only to the watcher of that call', () => {
    const { activity, captions, watcher } = rig();
    const tap = activity.begin(CALL);
    tap.caption('person', 'before anyone watches');
    activity.watch(watcher(), 'call-1');
    tap.caption('person', 'Turn on the lamp');
    tap.caption('assistant', 'Done');
    tap.caption('tool', 'Turning on the lamp');
    expect(captions).toEqual([
      { type: 'voice_caption', call_id: 'call-1', who: 'person', text: 'Turn on the lamp' },
      { type: 'voice_caption', call_id: 'call-1', who: 'assistant', text: 'Done' },
      { type: 'voice_caption', call_id: 'call-1', who: 'tool', text: 'Turning on the lamp' },
    ]);
  });

  it('announces a mute change once and carries it in the live snapshot', () => {
    const { activity, announced, watcher } = rig();
    const tap = activity.begin(CALL);
    tap.phase('listening');
    tap.muted(true);
    tap.muted(true);
    expect(announced.map((entry) => entry.notice.muted)).toEqual([false, true]);
    expect(activity.active(watcher()).map((notice) => notice.muted)).toEqual([true]);
  });
});
