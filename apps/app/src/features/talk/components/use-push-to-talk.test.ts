import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TalkFloor, TalkMemberRow } from '@smarteverything/domain';
import { IDLE_TRANSMIT, type TalkEngineState } from '../engine/engine-state';
import type { PushToTalk } from './use-push-to-talk';
import type * as EngineStateModule from '../engine/engine-state';

const CHANNEL = '00000000-0000-4000-8000-000000000001';
const SPEAKER = {
  kind: 'client',
  id: '00000000-0000-4000-8000-000000000003',
  label: 'Ana',
  detail: null,
} as const;

interface Inputs {
  engine: TalkEngineState;
  prefs: { talkEnabled: boolean; talkMode: 'hold' | 'tap' };
  member: TalkMemberRow | null;
  floor: TalkFloor | null;
}

const READY: TalkEngineState = {
  link: 'ready',
  problem: null,
  transmit: IDLE_TRANSMIT,
  receive: null,
  live: null,
  level: 0,
  lastDenial: null,
  lastEnding: null,
};

const inputs = vi.hoisted((): { current: Inputs | null } => ({ current: null }));
const press = vi.hoisted(() => vi.fn());
const release = vi.hoisted(() => vi.fn());
const tick = vi.hoisted(() => vi.fn());

vi.mock('../engine/engine-state', async (original) => ({
  ...(await original<typeof EngineStateModule>()),
  useTalkEngine: (): TalkEngineState | undefined => inputs.current?.engine,
}));
vi.mock('../engine/engine', () => ({ talkEngine: { press, release } }));
vi.mock('../../../platform/haptics', () => ({ selectionTick: tick }));
vi.mock('../../../store/local-prefs', () => ({
  useLocalPref: (key: 'talkEnabled' | 'talkMode'): boolean | 'hold' | 'tap' | undefined =>
    inputs.current?.prefs[key],
}));
vi.mock('../data/talk-data', () => ({
  useOwnMembership: (): TalkMemberRow | null => inputs.current?.member ?? null,
  useFloor: (): TalkFloor | null => inputs.current?.floor ?? null,
}));

const { usePushToTalk } = await import('./use-push-to-talk');

const MEMBER: TalkMemberRow = {
  channel_id: CHANNEL,
  member_kind: 'client',
  member_id: SPEAKER.id,
  label: 'Me',
  detail: null,
  listening: true,
  created_at: '2026-10-16T00:00:00.000Z',
};

function use(change: Partial<Inputs> = {}): PushToTalk {
  inputs.current = {
    engine: READY,
    prefs: { talkEnabled: true, talkMode: 'hold' },
    member: MEMBER,
    floor: null,
    ...change,
  };
  return usePushToTalk(CHANNEL);
}

describe('usePushToTalk state', () => {
  beforeEach(() => {
    press.mockReset();
    release.mockReset();
    tick.mockReset();
  });

  it('is off when the device has talk switched off', () => {
    expect(use({ prefs: { talkEnabled: false, talkMode: 'hold' } }).state).toBe('off');
  });

  it('is unavailable until the link is ready, before it checks membership', () => {
    expect(use({ engine: { ...READY, link: 'connecting' }, member: null }).state).toBe(
      'unavailable',
    );
  });

  it('is not_member for a channel the device has not joined', () => {
    expect(use({ member: null }).state).toBe('not_member');
  });

  it('is ready on a free channel and busy when someone else holds the floor', () => {
    expect(use().state).toBe('ready');
    const floor: TalkFloor = {
      channelId: CHANNEL,
      messageId: SPEAKER.id,
      kind: 'talk',
      speaker: SPEAKER,
      startedAt: '2026-10-16T10:00:00.000Z',
    };
    const busy = use({ floor });
    expect(busy.state).toBe('busy');
    expect(busy.speaker?.label).toBe('Ana');
  });

  it('shows my own request and talking, only on the channel I am using', () => {
    const transmit = {
      ...IDLE_TRANSMIT,
      status: 'talking',
      channelId: CHANNEL,
      messageId: 'm',
    } as const;
    const mine = use({ engine: { ...READY, transmit, level: 0.4 } });
    expect(mine.state).toBe('talking');
    expect(mine.level).toBe(0.4);
    const elsewhere = use({
      engine: { ...READY, transmit: { ...transmit, channelId: 'other' }, level: 0.4 },
    });
    expect(elsewhere.state).not.toBe('talking');
    expect(elsewhere.level).toBe(0);
  });

  it('is receiving while the channel is heard and live during a conversation', () => {
    const receive = { channelId: CHANNEL, messageId: 'm', speaker: SPEAKER, startedAt: 0 };
    expect(use({ engine: { ...READY, receive } }).state).toBe('receiving');
    const live = { channelId: CHANNEL, conversationId: 'c', label: 'Jev' };
    const talk = use({ engine: { ...READY, receive, live } });
    expect(talk.state).toBe('live');
    expect(talk.liveLabel).toBe('Jev');
  });
});

describe('usePushToTalk handlers', () => {
  beforeEach(() => {
    press.mockReset();
    release.mockReset();
    tick.mockReset();
  });

  it('presses on pressing in and releases on letting go in hold mode', () => {
    const talk = use();
    talk.onPressIn();
    expect(press).toHaveBeenCalledWith(CHANNEL);
    expect(tick).toHaveBeenCalledTimes(1);
    talk.onPressOut();
    expect(release).not.toHaveBeenCalled();
    const transmit = { ...IDLE_TRANSMIT, status: 'talking', channelId: CHANNEL } as const;
    use({ engine: { ...READY, transmit } }).onPressOut();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not press in hold mode unless the channel is ready', () => {
    const floor: TalkFloor = {
      channelId: CHANNEL,
      messageId: SPEAKER.id,
      kind: 'talk',
      speaker: SPEAKER,
      startedAt: '2026-10-16T10:00:00.000Z',
    };
    use({ floor }).onPressIn();
    expect(press).not.toHaveBeenCalled();
  });

  it('starts on one tap and stops on the next in tap mode, ignoring press in and out', () => {
    const prefs = { talkEnabled: true, talkMode: 'tap' } as const;
    const idle = use({ prefs });
    idle.onPressIn();
    idle.onPressOut();
    expect(press).not.toHaveBeenCalled();
    idle.onPress();
    expect(press).toHaveBeenCalledWith(CHANNEL);
    const transmit = { ...IDLE_TRANSMIT, status: 'requesting', channelId: CHANNEL } as const;
    use({ prefs, engine: { ...READY, transmit } }).onPress();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
