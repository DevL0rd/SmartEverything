import { describe, expect, it } from 'vitest';
import { TALK_ICONS, type TalkChannelRow } from '@smarteverything/domain';
import { IDLE_TRANSMIT, type TalkEngineState } from '../engine/engine-state';
import { engineStatus } from './talk-status';

const STATE: TalkEngineState = {
  link: 'ready',
  problem: null,
  transmit: IDLE_TRANSMIT,
  receive: null,
  live: null,
  level: 0,
  lastDenial: null,
  lastEnding: null,
};

const CHANNEL: TalkChannelRow = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Kitchen',
  icon: TALK_ICONS[0],
  priority: 'normal',
  keep_hours: 24,
  ai_listens: true,
  position: 0,
  created_at: '2026-10-16T00:00:00.000Z',
  updated_at: '2026-10-16T00:00:00.000Z',
};

describe('engineStatus', () => {
  it('says why talk is off', () => {
    expect(engineStatus({ ...STATE, link: 'off' }, CHANNEL, true)).toBe('Off on this device');
    expect(engineStatus({ ...STATE, link: 'off' }, undefined, false)).toBe('No channel yet');
  });

  it('shows the problem while the link is not ready, or that it is connecting', () => {
    expect(
      engineStatus(
        { ...STATE, link: 'offline', problem: 'Can’t reach your server' },
        CHANNEL,
        true,
      ),
    ).toBe('Can’t reach your server');
    expect(engineStatus({ ...STATE, link: 'connecting' }, CHANNEL, true)).toBe('Connecting…');
  });

  it('puts a live conversation before talking, and talking before receiving', () => {
    const speaker = { kind: 'client', id: CHANNEL.id, label: 'Ana', detail: null } as const;
    const receive = { channelId: CHANNEL.id, messageId: CHANNEL.id, speaker, startedAt: 0 };
    const talking = { ...IDLE_TRANSMIT, status: 'talking' } as const;
    const live = { channelId: CHANNEL.id, conversationId: 'c', label: 'Jev' };
    expect(engineStatus({ ...STATE, live, transmit: talking, receive }, CHANNEL, true)).toBe(
      'Jev is talking · mic on',
    );
    expect(engineStatus({ ...STATE, transmit: talking, receive }, CHANNEL, true)).toBe(
      'Talking · Kitchen',
    );
    expect(engineStatus({ ...STATE, receive }, CHANNEL, true)).toBe('Ana is talking');
  });

  it('is ready on the channel, or on no channel yet', () => {
    expect(engineStatus(STATE, CHANNEL, true)).toBe('Ready · Kitchen');
    expect(engineStatus(STATE, undefined, false)).toBe('Ready · No channel yet');
  });
});
