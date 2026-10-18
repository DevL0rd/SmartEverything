import { describe, expect, it } from 'vitest';
import type { DeviceCapability, PresentedCapability } from '@smarteverything/domain';
import { pendingConfirm, settleConfirm } from '../../../components/confirm-store';
import type { Device } from '../../../store/state';
import { deviceModelOf } from '../model/device-model';
import { approved, argumentValue, argumentsOf, presetArguments } from './run-action';

function presentedAction(
  key: DeviceCapability['key'],
  label: string,
  args?: string[],
): PresentedCapability {
  const capability: DeviceCapability = {
    key,
    label,
    access: 'write',
    value: args === undefined ? { kind: 'action' } : { kind: 'action', arguments: args },
  };
  const model = deviceModelOf(deviceWith([capability]));
  const found = model.presentation.capabilities[0];
  if (found === undefined) {
    throw new Error('no capability');
  }
  return found;
}

function deviceWith(capabilities: DeviceCapability[]): Device {
  return {
    id: 'd1',
    provider: 'local',
    external_id: `d1-${capabilities.map((item) => item.key).join(',')}`,
    parent_id: null,
    kind: 'air_purifier',
    name: 'Purifier',
    display_name: null,
    model: 'generic',
    manufacturer: 'test',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities,
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
    label: 'Purifier',
  };
}

describe('argumentsOf and presetArguments', () => {
  it('lists the argument names of an action and none for an action without arguments', () => {
    expect(argumentsOf(presentedAction('raw:self_clean', 'Clean', ['minutes']))).toEqual([
      'minutes',
    ]);
    expect(argumentsOf(presentedAction('raw:self_clean', 'Clean'))).toEqual([]);
  });

  it('sends null for an action without arguments', () => {
    expect(presetArguments(presentedAction('raw:self_clean', 'Clean'))).toBeNull();
  });

  it('resets every argument of a filter reset to zero and asks for the others', () => {
    const reset = presentedAction('filter_reset', 'Reset filter', ['life', 'days']);
    expect(presetArguments(reset)).toEqual({ life: 0, days: 0 });
    expect(
      presetArguments(presentedAction('raw:self_clean', 'Clean', ['minutes'])),
    ).toBeUndefined();
  });
});

describe('argumentValue', () => {
  it('reads numbers and booleans from typed text and keeps the rest as trimmed text', () => {
    expect(argumentValue(' 12 ')).toBe(12);
    expect(argumentValue('-3.5')).toBe(-3.5);
    expect(argumentValue('true')).toBe(true);
    expect(argumentValue('false')).toBe(false);
    expect(argumentValue(' hello ')).toBe('hello');
    expect(argumentValue('1e3')).toBe('1e3');
    expect(argumentValue('')).toBe('');
  });
});

describe('approved', () => {
  it('runs a harmless action without asking', async () => {
    await expect(approved(presentedAction('raw:self_clean', 'Clean'), 'Purifier')).resolves.toBe(
      true,
    );
    expect(pendingConfirm.get()).toBeNull();
  });

  it('asks before a restart and runs it only when accepted', async () => {
    const answer = approved(presentedAction('restart', 'Restart'), 'Purifier');
    expect(pendingConfirm.get()).toMatchObject({
      title: 'Restart?',
      body: 'Purifier will do this right away.',
      confirmLabel: 'Restart',
      tone: 'destructive',
    });
    expect(pendingConfirm.get()?.typed).toBeUndefined();
    settleConfirm(false);
    await expect(answer).resolves.toBe(false);
  });

  it('makes the person type the word before a format', async () => {
    const answer = approved(presentedAction('raw:format_storage', 'Format card'), 'Purifier');
    expect(pendingConfirm.get()).toMatchObject({
      title: 'Format card?',
      body: "This can't be undone on Purifier.",
      typed: 'FORMAT',
    });
    settleConfirm(true);
    await expect(answer).resolves.toBe(true);
  });
});
