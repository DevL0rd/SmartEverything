import type { DeviceRow, JsonValue, StateRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { RoomMedia, SpeakingScope, type SpeakingCall } from '../../src/reach/room-media';
import type { NewCommand } from '../../src/store/repositories/commands';
import { testLogger } from '../support/logs';

const START = '2026-10-18T10:00:00.000Z';
const LIVING = '11111111-1111-4111-8111-111111111111';
const KITCHEN = '22222222-2222-4222-8222-222222222222';
const SPEAKER = '33333333-3333-4333-8333-333333333333';
const TV = '44444444-4444-4444-8444-444444444444';
const RADIO = '55555555-5555-4555-8555-555555555555';
const OTHER = '66666666-6666-4666-8666-666666666666';

function device(id: string, roomId: string | null, options: readonly string[] | null): DeviceRow {
  return {
    id,
    provider: 'local',
    external_id: id,
    parent_id: null,
    kind: 'speaker',
    name: id,
    display_name: null,
    model: 'fake',
    manufacturer: 'fake',
    provider_room: null,
    room_id: roomId,
    online: true,
    capabilities:
      options === null
        ? []
        : [
            {
              key: 'playback',
              label: 'Playback',
              access: 'read_write',
              value: { kind: 'enum', options: [...options] },
            },
          ],
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: START,
    updated_at: START,
  };
}

interface Rig {
  readonly media: RoomMedia;
  readonly sent: NewCommand[];
  readonly states: Map<string, JsonValue>;
  readonly enabled: { value: boolean };
  readonly failing: { value: boolean };
}

function rig(): Rig {
  const sent: NewCommand[] = [];
  const enabled = { value: true };
  const failing = { value: false };
  const states = new Map<string, JsonValue>([
    [TV, 'playing'],
    [RADIO, 'playing'],
    [OTHER, 'playing'],
  ]);
  const devices = [
    device(SPEAKER, LIVING, null),
    device(TV, LIVING, ['playing', 'paused', 'stopped']),
    device(RADIO, LIVING, ['play', 'pause']),
    device(OTHER, KITCHEN, ['playing', 'paused', 'stopped']),
  ];
  const media = new RoomMedia({
    store: {
      devices: {
        list: (): DeviceRow[] => devices,
        find: (id): DeviceRow | undefined => devices.find((entry) => entry.id === id),
        byExternal: (_provider, externalId): DeviceRow | undefined =>
          devices.find((entry) => entry.external_id === externalId),
      },
      state: {
        ofDevice: (id): StateRow[] => [
          {
            device_id: id,
            capability: 'playback',
            value: states.get(id) ?? null,
            observed_at: START,
          },
        ],
      },
    },
    enabled: (): boolean => enabled.value,
    submit: (commands): void => {
      if (failing.value) {
        throw new Error('hub offline');
      }
      sent.push(...commands);
    },
    log: testLogger(),
  });
  return { media, sent, states, enabled, failing };
}

const call = (id: string): SpeakingCall => ({ id, deviceId: SPEAKER, clientId: null });

const summary = (sent: readonly NewCommand[]): string[] =>
  sent.map(
    (entry) => `${String(entry.deviceId)}:${JSON.stringify(entry.value).replaceAll('"', '')}`,
  );

describe('RoomMedia', () => {
  it('pauses only playing media in the speaker room and resumes exactly those', () => {
    const { media, sent, states } = rig();
    media.speaking(call('a'), true);
    expect(summary(sent)).toStrictEqual([`${TV}:paused`, `${RADIO}:pause`]);
    states.set(TV, 'paused');
    states.set(RADIO, 'paused');
    sent.length = 0;
    media.speaking(call('a'), false);
    expect(summary(sent)).toStrictEqual([`${TV}:playing`, `${RADIO}:play`]);
  });

  it('leaves media that was already paused or stopped alone', () => {
    const { media, sent, states } = rig();
    states.set(TV, 'paused');
    states.set(RADIO, 'stopped');
    media.speaking(call('a'), true);
    media.speaking(call('a'), false);
    expect(sent).toStrictEqual([]);
  });

  it('does nothing when the setting is off', () => {
    const r = rig();
    r.enabled.value = false;
    r.media.speaking(call('a'), true);
    r.media.speaking(call('a'), false);
    expect(r.sent).toStrictEqual([]);
  });

  it('does nothing when the speaking device has no room', () => {
    const { media, sent } = rig();
    media.speaking({ id: 'a', deviceId: null, clientId: null }, true);
    expect(sent).toStrictEqual([]);
  });

  it('resumes only after every call that paused it has stopped speaking', () => {
    const { media, sent } = rig();
    media.speaking(call('a'), true);
    media.speaking(call('b'), true);
    sent.length = 0;
    media.speaking(call('a'), false);
    expect(sent).toStrictEqual([]);
    media.speaking(call('b'), false);
    expect(summary(sent)).toStrictEqual([`${TV}:playing`, `${RADIO}:play`]);
  });

  it('does not resume media the person stopped meanwhile', () => {
    const { media, sent, states } = rig();
    media.speaking(call('a'), true);
    sent.length = 0;
    states.set(TV, 'stopped');
    media.speaking(call('a'), false);
    expect(summary(sent)).toStrictEqual([`${RADIO}:play`]);
  });

  it('still resumes after the setting is turned off mid-speech', () => {
    const r = rig();
    r.media.speaking(call('a'), true);
    r.sent.length = 0;
    r.enabled.value = false;
    r.media.speaking(call('a'), false);
    expect(r.sent).toHaveLength(2);
  });

  it('finds the room from a plugin device by its external id', () => {
    const { media, sent } = rig();
    media.speaking({ id: 'a', deviceId: null, clientId: null, externalId: SPEAKER }, true);
    expect(summary(sent)).toStrictEqual([`${TV}:paused`, `${RADIO}:pause`]);
  });

  it('never resumes media it failed to pause', () => {
    const r = rig();
    r.failing.value = true;
    expect(() => {
      r.media.speaking(call('a'), true);
    }).not.toThrow();
    r.failing.value = false;
    r.media.speaking(call('a'), false);
    expect(r.sent).toStrictEqual([]);
  });

  it('keeps going when resuming fails', () => {
    const r = rig();
    r.media.speaking(call('a'), true);
    r.failing.value = true;
    expect(() => {
      r.media.speaking(call('a'), false);
    }).not.toThrow();
    r.failing.value = false;
    r.sent.length = 0;
    r.media.speaking(call('a'), false);
    expect(r.sent).toStrictEqual([]);
  });
});

describe('SpeakingScope', () => {
  function scopeRig(): { scope: SpeakingScope; seen: boolean[] } {
    const seen: boolean[] = [];
    const scope = new SpeakingScope(
      {
        speaking: (_call, speaking): void => {
          seen.push(speaking);
        },
      },
      { id: 'a', deviceId: null, clientId: null },
    );
    return { scope, seen };
  }

  it('reports each start and stop once and can start again after a stop', () => {
    const { scope, seen } = scopeRig();
    scope.start();
    scope.start();
    scope.stop();
    scope.stop();
    scope.start();
    scope.stop();
    expect(seen).toStrictEqual([true, false, true, false]);
  });

  it('never starts again once closed, and closing while speaking stops it', () => {
    const { scope, seen } = scopeRig();
    scope.start();
    scope.close();
    scope.start();
    expect(seen).toStrictEqual([true, false]);
  });

  it('does nothing without a room media service', () => {
    const scope = new SpeakingScope(undefined, { id: 'a', deviceId: null, clientId: null });
    expect(() => {
      scope.start();
      scope.close();
    }).not.toThrow();
  });
});
