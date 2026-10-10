import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_CATALOGUE,
  COMMAND_REQUEST,
  DEVICE_COMMAND,
  CAPABILITY_KEY,
  COMMAND_STATUSES,
  CommandRefusedError,
  DEVICE_CAPABILITY,
  DEVICE_EVENT,
  DISCOVERED_DEVICE,
  EVENT_KINDS,
  STATE_UPDATE,
  capabilityOf,
  catalogueEntryOf,
  isFinished,
  isRawCapability,
  isStandardCapability,
  isPushed,
  isUrgent,
  pushedMessageOf,
  validateCommand,
  type DeviceCapability,
} from '../src';

const power: DeviceCapability = {
  key: 'power',
  label: 'Power',
  access: 'read_write',
  value: { kind: 'boolean' },
};

const pm25: DeviceCapability = {
  key: 'pm25',
  label: 'PM2.5',
  access: 'read',
  value: { kind: 'number', min: 0, max: 1000, step: 1, unit: 'µg/m³' },
};

const device = { capabilities: [power, pm25] };

describe('the capability catalogue', () => {
  it('knows its own keys', () => {
    expect(isStandardCapability('power')).toBe(true);
    expect(isStandardCapability('raw:2.1')).toBe(false);
    expect(isStandardCapability('toString')).toBe(false);
    expect(catalogueEntryOf('pm25')).toBe(CAPABILITY_CATALOGUE.pm25);
  });

  it('accepts raw capabilities with a lower-case name', () => {
    expect(isRawCapability('raw:2.1')).toBe(true);
    expect(isRawCapability('raw:action.5:1-a_b')).toBe(true);
    expect(isRawCapability('raw:')).toBe(false);
    expect(isRawCapability('raw:_x')).toBe(false);
    expect(isRawCapability('raw:A')).toBe(false);
    expect(isRawCapability('xraw:a')).toBe(false);
    expect(isRawCapability('raw:a ')).toBe(false);
  });

  it('parses keys from either family and refuses the rest', () => {
    expect(CAPABILITY_KEY.parse('power')).toBe('power');
    expect(CAPABILITY_KEY.parse('raw:9.9')).toBe('raw:9.9');
    const refused = CAPABILITY_KEY.safeParse('wattage');
    expect(refused.success).toBe(false);
    expect(refused.error?.issues[0]?.message).toBe(
      'not a catalogued capability or a raw:<name> capability',
    );
  });
});

describe('device capabilities', () => {
  it('requires the catalogue kind for a catalogued capability', () => {
    expect(DEVICE_CAPABILITY.safeParse(power).success).toBe(true);
    const refused = DEVICE_CAPABILITY.safeParse({
      ...power,
      value: { kind: 'enum', options: ['on'] },
    });
    expect(refused.success).toBe(false);
    expect(refused.error?.issues[0]?.message).toBe(
      'value kind differs from the catalogue for this capability',
    );
  });

  it('allows any kind for a raw capability', () => {
    expect(
      DEVICE_CAPABILITY.safeParse({
        ...power,
        key: 'raw:3.1',
        value: { kind: 'text', maxLength: 9 },
      }).success,
    ).toBe(true);
  });

  it('finds a capability on a device', () => {
    expect(capabilityOf(device, 'pm25')).toBe(pm25);
    expect(capabilityOf(device, 'humidity')).toBeUndefined();
  });

  it('parses a discovered device and a state update', () => {
    const discovered = {
      provider: 'xiaomi',
      externalId: '123',
      parentExternalId: null,
      kind: 'air_purifier',
      name: 'Purifier',
      model: 'zhimi.airp.va2',
      manufacturer: 'Xiaomi',
      room: 'Living room',
      online: true,
      capabilities: [power],
      details: { transport: 'lan' },
    };
    expect(DISCOVERED_DEVICE.parse(discovered)).toStrictEqual(discovered);
    const child = { ...discovered, parentExternalId: 'gateway-7' };
    expect(DISCOVERED_DEVICE.parse(child)).toStrictEqual(child);
    expect(DISCOVERED_DEVICE.safeParse({ ...discovered, parentExternalId: '' }).success).toBe(
      false,
    );
    expect(
      STATE_UPDATE.safeParse({
        externalId: '123',
        capability: 'power',
        value: true,
        observedAt: '2026-10-08T12:00:00+02:00',
      }).success,
    ).toBe(true);
    expect(
      STATE_UPDATE.safeParse({
        externalId: '123',
        capability: 'power',
        value: true,
        observedAt: 'yesterday',
      }).success,
    ).toBe(false);
  });
});

describe('commands', () => {
  it('parses a command request and a device command', () => {
    const request = {
      deviceId: '6f9a2a39-6d0b-4bde-9c8a-4f3f1a1b2c3d',
      capability: 'power',
      value: true,
    };
    expect(COMMAND_REQUEST.parse(request)).toStrictEqual(request);
    expect(COMMAND_REQUEST.safeParse({ ...request, deviceId: 'nope' }).success).toBe(false);
    const command = {
      commandId: '6f9a2a39-6d0b-4bde-9c8a-4f3f1a1b2c3d',
      externalId: 'lumi.158d0001',
      capability: 'raw:2.1',
      value: 3,
    };
    expect(DEVICE_COMMAND.parse(command)).toStrictEqual(command);
    expect(DEVICE_COMMAND.safeParse({ ...command, externalId: '' }).success).toBe(false);
    expect(DEVICE_COMMAND.safeParse({ ...command, commandId: 'x' }).success).toBe(false);
  });

  it('returns the checked value for a writable capability', () => {
    expect(validateCommand(device, { capability: 'power', value: false })).toBe(false);
  });

  it('refuses a capability the device does not have', () => {
    expect(() => validateCommand(device, { capability: 'humidity', value: 40 })).toThrow(
      new CommandRefusedError('humidity', 'the device does not have it'),
    );
  });

  it('refuses to write a read-only capability', () => {
    const refusal = new CommandRefusedError('pm25', 'it can only be read');
    expect(() => validateCommand(device, { capability: 'pm25', value: 3 })).toThrow(refusal);
    expect(refusal.message).toBe('The command for pm25 was refused: it can only be read.');
    expect(refusal.name).toBe('CommandRefusedError');
    expect(refusal.capability).toBe('pm25');
    expect(refusal.reason).toBe('it can only be read');
  });

  it('allows a write-only capability', () => {
    const reset: DeviceCapability = {
      key: 'filter_reset',
      label: 'Reset filter',
      access: 'write',
      value: { kind: 'action' },
    };
    expect(
      validateCommand({ capabilities: [reset] }, { capability: 'filter_reset', value: null }),
    ).toBeNull();
  });

  it('knows which statuses are final', () => {
    expect(COMMAND_STATUSES.filter(isFinished)).toStrictEqual(['succeeded', 'failed', 'expired']);
  });
});

describe('events', () => {
  it('marks only events a person must see at once as urgent', () => {
    expect(EVENT_KINDS.filter(isUrgent)).toStrictEqual([
      'doorbell',
      'call',
      'alarm',
      'leak',
      'smoke',
    ]);
  });

  it('parses an event with or without a UTC offset', () => {
    const event = {
      externalId: 'cam',
      kind: 'doorbell',
      occurredAt: '2026-10-08T12:00:00Z',
      details: { clip: true },
    };
    expect(DEVICE_EVENT.parse(event)).toStrictEqual(event);
    const offset = { ...event, occurredAt: '2026-10-08T12:00:00+02:00' };
    expect(DEVICE_EVENT.parse(offset)).toStrictEqual(offset);
    expect(DEVICE_EVENT.safeParse({ ...event, kind: 'sneeze' }).success).toBe(false);
    expect(DEVICE_EVENT.safeParse({ ...event, externalId: '' }).success).toBe(false);
  });

  it('pushes urgent events and automation runs that carry a message', () => {
    expect(isPushed('doorbell', {})).toBe(true);
    expect(isPushed('motion', {})).toBe(false);
    expect(isPushed('automation_run', { message: 'Leak in the laundry' })).toBe(true);
    expect(isPushed('automation_run', {})).toBe(false);
    expect(isPushed('automation_run', { message: '' })).toBe(false);
    expect(isPushed('automation_run', { message: 3 })).toBe(false);
    expect(isPushed('motion', { message: 'Moved' })).toBe(false);
    expect(pushedMessageOf('automation_run', { message: 'Bedtime' })).toBe('Bedtime');
    expect(pushedMessageOf('motion', { message: 'Bedtime' })).toBeNull();
  });
});
