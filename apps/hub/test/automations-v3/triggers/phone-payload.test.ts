import { describe, expect, it } from 'vitest';
import { signalPayload } from '../../../src/automations/triggers-v3/payload';
import { signal } from './support';

function phoneKind(field: string, value: boolean | number, previous: boolean | number): unknown {
  return signalPayload('trigger.phone', signal({ subject: 'phone-1', field, value, previous }))[
    'kind'
  ];
}

describe('trigger.phone payload', () => {
  it('names a call that started', () => {
    expect(phoneKind('in_call', true, false)).toBe('call_started');
  });

  it('names a call that ended', () => {
    expect(phoneKind('in_call', false, true)).toBe('call_ended');
  });

  it('names a changed notification count', () => {
    expect(phoneKind('notification_count', 3, 1)).toBe('notification_count_changed');
  });

  it('names a charger plugged in and unplugged', () => {
    expect(phoneKind('charging', true, false)).toBe('charger_plugged');
    expect(phoneKind('charging', false, true)).toBe('charger_unplugged');
  });
});
