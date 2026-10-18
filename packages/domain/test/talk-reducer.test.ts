import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  IDLE_TALK_SESSION,
  IDLE_TRANSMIT,
  TALK_DENIALS,
  TALK_ENDINGS,
  reduceTalk,
  type TalkInput,
  type TalkServerMessage,
  type TalkSession,
  type TalkStep,
} from '../src';

const CHANNEL = '00000000-0000-4000-8000-000000000001';
const OTHER_CHANNEL = '00000000-0000-4000-8000-000000000002';
const MESSAGE = '00000000-0000-4000-8000-000000000003';
const OTHER_MESSAGE = '00000000-0000-4000-8000-000000000004';
const CAMERA = '00000000-0000-4000-8000-000000000005';
const SPEAKER = {
  kind: 'client',
  id: '00000000-0000-4000-8000-000000000006',
  label: 'Ana',
  detail: null,
} as const;
const NOW = 1_000;

function message(value: TalkServerMessage, session = IDLE_TALK_SESSION): TalkStep {
  return reduceTalk(session, { kind: 'message', message: value }, NOW);
}

function requesting(): TalkSession {
  return reduceTalk(IDLE_TALK_SESSION, { kind: 'press', channelId: CHANNEL }, NOW).session;
}

function talking(): TalkSession {
  return message(
    { type: 'granted', channelId: CHANNEL, messageId: MESSAGE, limitSeconds: 60 },
    requesting(),
  ).session;
}

function live(session = IDLE_TALK_SESSION): TalkSession {
  return message(
    { type: 'live_start', channelId: CHANNEL, conversationId: 'c1', label: 'Jev' },
    session,
  ).session;
}

function receiving(): TalkSession {
  return message({
    type: 'rx_start',
    channelId: CHANNEL,
    messageId: MESSAGE,
    speaker: SPEAKER,
  }).session;
}

describe('reduceTalk local input', () => {
  it('asks for the floor on press and opens the microphone', () => {
    const step = reduceTalk(IDLE_TALK_SESSION, { kind: 'press', channelId: CHANNEL }, NOW);
    expect(step.session.transmit).toEqual({
      ...IDLE_TRANSMIT,
      status: 'requesting',
      channelId: CHANNEL,
    });
    expect(step.effects).toEqual([
      { kind: 'send', message: { type: 'press', channelId: CHANNEL } },
      { kind: 'open_capture', purpose: 'press' },
    ]);
  });

  it('asks to listen through a camera without opening the microphone', () => {
    const step = reduceTalk(
      IDLE_TALK_SESSION,
      { kind: 'listen', channelId: CHANNEL, cameraId: CAMERA },
      NOW,
    );
    expect(step.session.transmit).toMatchObject({ status: 'requesting', cameraId: CAMERA });
    expect(step.effects).toEqual([
      { kind: 'send', message: { type: 'listen', channelId: CHANNEL, cameraId: CAMERA } },
    ]);
  });

  it('gives the floor back and stops the microphone on release, and ignores an idle release', () => {
    const step = reduceTalk(talking(), { kind: 'release' }, NOW);
    expect(step.session.transmit).toEqual(IDLE_TRANSMIT);
    expect(step.effects).toEqual([
      { kind: 'send', message: { type: 'release' } },
      { kind: 'stop_capture' },
    ]);
    expect(reduceTalk(IDLE_TALK_SESSION, { kind: 'release' }, NOW)).toEqual({
      session: IDLE_TALK_SESSION,
      effects: [],
    });
  });

  it('leaves a live conversation by releasing and ending playback, and ignores it when none is live', () => {
    const step = reduceTalk(live(), { kind: 'leave_live' }, NOW);
    expect(step.session.live).toBeNull();
    expect(step.effects).toEqual([
      { kind: 'send', message: { type: 'release' } },
      { kind: 'stop_capture' },
      { kind: 'playback_end' },
    ]);
    expect(reduceTalk(IDLE_TALK_SESSION, { kind: 'leave_live' }, NOW).effects).toEqual([]);
  });
});

describe('reduceTalk server messages', () => {
  it('talks once the floor is granted for the pending press and flushes early audio', () => {
    const step = message(
      { type: 'granted', channelId: CHANNEL, messageId: MESSAGE, limitSeconds: 60 },
      requesting(),
    );
    expect(step.session.transmit).toMatchObject({
      status: 'talking',
      messageId: MESSAGE,
      startedAt: NOW,
      limitSeconds: 60,
    });
    expect(step.effects).toEqual([{ kind: 'tone', tone: 'permit' }, { kind: 'flush_early_audio' }]);
  });

  it('gives the floor back when it is granted without a pending press or for another channel', () => {
    const grant: TalkServerMessage = {
      type: 'granted',
      channelId: OTHER_CHANNEL,
      messageId: MESSAGE,
      limitSeconds: 60,
    };
    for (const session of [IDLE_TALK_SESSION, requesting()]) {
      expect(message(grant, session)).toEqual({
        session,
        effects: [{ kind: 'send', message: { type: 'release' } }],
      });
    }
  });

  it('returns to idle with the reason when the floor is denied', () => {
    const step = message({ type: 'denied', channelId: CHANNEL, reason: 'busy' }, requesting());
    expect(step.session.transmit).toEqual(IDLE_TRANSMIT);
    expect(step.session.lastDenial).toEqual({ channelId: CHANNEL, reason: 'busy' });
    expect(step.effects).toEqual([{ kind: 'stop_capture' }, { kind: 'tone', tone: 'busy' }]);
  });

  it('ends its own message and ignores the end of another one', () => {
    const own = message(
      { type: 'ended', messageId: MESSAGE, reason: 'time_limit', detail: null },
      talking(),
    );
    expect(own.session.transmit).toEqual(IDLE_TRANSMIT);
    expect(own.session.lastEnding).toBe('time_limit');
    expect(own.effects).toEqual([{ kind: 'stop_capture' }, { kind: 'tone', tone: 'end' }]);
    const foreign = message(
      { type: 'ended', messageId: OTHER_MESSAGE, reason: 'released', detail: null },
      talking(),
    );
    expect(foreign).toEqual({ session: talking(), effects: [] });
  });

  it('shows who is speaking and clears it when that message ends', () => {
    expect(receiving().receive).toEqual({
      channelId: CHANNEL,
      messageId: MESSAGE,
      speaker: SPEAKER,
      startedAt: NOW,
    });
    expect(message({ type: 'rx_end', messageId: OTHER_MESSAGE }, receiving()).effects).toEqual([]);
    const step = message({ type: 'rx_end', messageId: MESSAGE }, receiving());
    expect(step.session.receive).toBeNull();
    expect(step.effects).toEqual([{ kind: 'playback_end' }, { kind: 'tone', tone: 'roger' }]);
  });

  it('opens the microphone for a live conversation only while not transmitting', () => {
    const idle = message({
      type: 'live_start',
      channelId: CHANNEL,
      conversationId: 'c1',
      label: 'Jev',
    });
    expect(idle.session.live).toEqual({ channelId: CHANNEL, conversationId: 'c1', label: 'Jev' });
    expect(idle.effects).toEqual([
      { kind: 'playback_begin' },
      { kind: 'open_capture', purpose: 'live', conversationId: 'c1' },
    ]);
    const busy = live(talking());
    expect(message({ type: 'live_end', channelId: CHANNEL, conversationId: 'c1' }, busy)).toEqual({
      session: { ...busy, live: null },
      effects: [{ kind: 'playback_end' }],
    });
    expect(
      message(
        { type: 'live_start', channelId: CHANNEL, conversationId: 'c2', label: 'Jev' },
        talking(),
      ).effects,
    ).toEqual([{ kind: 'playback_begin' }]);
  });

  it('closes a live conversation, stopping the microphone, and ignores another conversation', () => {
    const open = live();
    expect(
      message({ type: 'live_end', channelId: CHANNEL, conversationId: 'other' }, open).effects,
    ).toEqual([]);
    const step = message({ type: 'live_end', channelId: CHANNEL, conversationId: 'c1' }, open);
    expect(step.session.live).toBeNull();
    expect(step.effects).toEqual([{ kind: 'stop_capture' }, { kind: 'playback_end' }]);
  });

  it('leaves the session alone for link-level messages', () => {
    expect(message({ type: 'ready', clientId: CHANNEL, channels: [] }, talking())).toEqual({
      session: talking(),
      effects: [],
    });
    expect(message({ type: 'channels', channels: [CHANNEL] }, talking())).toEqual({
      session: talking(),
      effects: [],
    });
  });
});

const ID = fc.constantFrom(CHANNEL, OTHER_CHANNEL, MESSAGE, OTHER_MESSAGE);

const SERVER_MESSAGE: fc.Arbitrary<TalkServerMessage> = fc.oneof(
  fc.constant<TalkServerMessage>({ type: 'ready', clientId: CHANNEL, channels: [] }),
  fc.constant<TalkServerMessage>({ type: 'channels', channels: [] }),
  fc.record({
    type: fc.constant('granted' as const),
    channelId: ID,
    messageId: ID,
    limitSeconds: fc.integer({ min: 1, max: 600 }),
  }),
  fc.record({
    type: fc.constant('denied' as const),
    channelId: ID,
    reason: fc.constantFrom(...TALK_DENIALS),
  }),
  fc.record({
    type: fc.constant('ended' as const),
    messageId: ID,
    reason: fc.constantFrom(...TALK_ENDINGS),
    detail: fc.constant(null),
  }),
  fc.record({
    type: fc.constant('rx_start' as const),
    channelId: ID,
    messageId: ID,
    speaker: fc.constant(SPEAKER),
  }),
  fc.record({ type: fc.constant('rx_end' as const), messageId: ID }),
  fc.record({
    type: fc.constant('live_start' as const),
    channelId: ID,
    conversationId: fc.constantFrom('c1', 'c2'),
    label: fc.constant('Jev'),
  }),
  fc.record({
    type: fc.constant('live_end' as const),
    channelId: ID,
    conversationId: fc.constantFrom('c1', 'c2'),
  }),
);

const INPUT: fc.Arbitrary<TalkInput> = fc.oneof(
  SERVER_MESSAGE.map((value): TalkInput => ({ kind: 'message', message: value })),
  ID.map((channelId): TalkInput => ({ kind: 'press', channelId })),
  ID.map((channelId): TalkInput => ({ kind: 'listen', channelId, cameraId: CAMERA })),
  fc.constant<TalkInput>({ kind: 'release' }),
  fc.constant<TalkInput>({ kind: 'leave_live' }),
);

function replay(inputs: readonly TalkInput[]): readonly TalkStep[] {
  const steps: TalkStep[] = [];
  let session = IDLE_TALK_SESSION;
  for (const input of inputs) {
    const step = reduceTalk(session, input, NOW);
    steps.push(step);
    session = step.session;
  }
  return steps;
}

describe('reduceTalk over any message sequence', () => {
  it('keeps the transmit fields consistent with its status', () => {
    fc.assert(
      fc.property(fc.array(INPUT, { maxLength: 40 }), (inputs) => {
        for (const { session } of replay(inputs)) {
          const { transmit } = session;
          if (transmit.status === 'idle') {
            expect(transmit).toEqual(IDLE_TRANSMIT);
          } else {
            expect(transmit.channelId).not.toBeNull();
            expect(transmit.messageId === null).toBe(transmit.status === 'requesting');
          }
        }
      }),
    );
  });

  it('is deterministic and does not change the session it was given', () => {
    fc.assert(
      fc.property(fc.array(INPUT, { maxLength: 40 }), (inputs) => {
        expect(replay(inputs)).toEqual(replay(inputs));
        expect(IDLE_TALK_SESSION).toEqual({
          transmit: IDLE_TRANSMIT,
          receive: null,
          live: null,
          lastDenial: null,
          lastEnding: null,
        });
      }),
    );
  });

  it('answers a grant it did not ask for with exactly one release and no state change', () => {
    fc.assert(
      fc.property(fc.array(INPUT, { maxLength: 30 }), ID, ID, (inputs, channelId, messageId) => {
        const before = replay(inputs).at(-1)?.session ?? IDLE_TALK_SESSION;
        const asked =
          before.transmit.status === 'requesting' && before.transmit.channelId === channelId;
        const step = reduceTalk(
          before,
          { kind: 'message', message: { type: 'granted', channelId, messageId, limitSeconds: 5 } },
          NOW,
        );
        if (!asked) {
          expect(step).toEqual({
            session: before,
            effects: [{ kind: 'send', message: { type: 'release' } }],
          });
        }
      }),
    );
  });
});
