import {
  MEDIA_STATUSES,
  nowPlayingText,
  type ComputerSessionState,
  type DeviceCapability,
  type JsonValue,
  type StandardCapability,
} from '@smarteverything/domain';

const TEXT_LONGEST = 300;

export interface SessionReading {
  readonly key: StandardCapability;
  readonly value: JsonValue;
}

const TEXT = { kind: 'text', maxLength: TEXT_LONGEST } as const;

function readings(session: ComputerSessionState, apps: boolean): SessionReading[] {
  const list: SessionReading[] = [];
  if (session.user !== null) {
    list.push({ key: 'signed_in_user', value: session.user });
  }
  if (session.locked !== null) {
    list.push({ key: 'locked', value: session.locked });
  }
  if (apps) {
    list.push({ key: 'focused_app', value: session.focused?.name ?? '' });
  }
  if (session.volume !== null && session.muted !== null) {
    list.push(
      { key: 'volume', value: Math.round(session.volume) },
      { key: 'mute', value: session.muted },
    );
  }
  if (session.media !== null) {
    list.push(
      { key: 'playback', value: session.media.status },
      { key: 'now_playing', value: nowPlayingText(session.media) },
    );
  }
  return list;
}

const CAPABILITIES: Readonly<Partial<Record<StandardCapability, Omit<DeviceCapability, 'key'>>>> = {
  signed_in_user: { label: 'Signed in', access: 'read', value: TEXT },
  locked: { label: 'Locked', access: 'read', value: { kind: 'boolean' } },
  focused_app: { label: 'Active app', access: 'read', value: TEXT },
  volume: {
    label: 'Volume',
    access: 'read_write',
    value: { kind: 'number', min: 0, max: 100, step: 1, unit: '%' },
  },
  mute: { label: 'Mute', access: 'read_write', value: { kind: 'boolean' } },
  playback: {
    label: 'Playback',
    access: 'read_write',
    value: { kind: 'enum', options: [...MEDIA_STATUSES] },
  },
  now_playing: { label: 'Now playing', access: 'read', value: TEXT },
};

export function sessionReadings(
  session: ComputerSessionState | null,
  apps: boolean,
): SessionReading[] {
  return session === null ? [] : readings(session, apps);
}

export function sessionCapabilities(
  session: ComputerSessionState | null,
  apps: boolean,
): DeviceCapability[] {
  return sessionReadings(session, apps).flatMap((reading) => {
    const capability = CAPABILITIES[reading.key];
    return capability === undefined ? [] : [{ key: reading.key, ...capability }];
  });
}
