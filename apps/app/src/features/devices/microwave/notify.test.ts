import { MICROWAVE_KEYS, type DeviceCapability } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => {
  const saved: unknown[] = [];
  const toggled: unknown[] = [];
  return { saved, toggled };
});

vi.mock('../../../api/automations', () => ({
  saveAutomation: (save: unknown): Promise<void> => {
    calls.saved.push(save);
    return Promise.resolve();
  },
  setAutomationEnabled: (id: string, enabled: boolean): Promise<void> => {
    calls.toggled.push([id, enabled]);
    return Promise.resolve();
  },
}));

const { templatesFor } = await import('../../automations');
const { setTemplate } = await import('../laundry/notify');

function text(key: DeviceCapability['key']): DeviceCapability {
  return { key, label: key, access: 'read', value: { kind: 'text', maxLength: 40 } };
}

const MICROWAVE = {
  id: '20000000-0000-4000-8000-000000000001',
  label: 'Kitchen microwave',
  kind: 'appliance' as const,
  model: 'MW7300B',
  capabilities: [
    MICROWAVE_KEYS.mode,
    MICROWAVE_KEYS.power,
    MICROWAVE_KEYS.state,
    MICROWAVE_KEYS.job,
    MICROWAVE_KEYS.door,
  ].map(text),
};

const [READY, INSIDE] = templatesFor([MICROWAVE]);

describe('microwave notify me switches', () => {
  it('offers food is ready and food still inside', () => {
    expect(READY?.short).toBe('Food is ready');
    expect(INSIDE?.short).toBe('Food still inside');
  });

  it('creates the food is ready automation the first time it is switched on', async () => {
    if (READY === undefined) throw new Error('template missing');
    calls.saved.length = 0;
    await setTemplate(READY, null, true);
    expect(calls.saved).toEqual([
      {
        automationId: null,
        name: READY.draft.name,
        enabled: true,
        definition: READY.draft.automation,
      },
    ]);
  });

  it('turns an existing automation on and off', async () => {
    if (INSIDE === undefined) throw new Error('template missing');
    calls.toggled.length = 0;
    await setTemplate(INSIDE, { id: 'a1', enabled: false }, true);
    await setTemplate(INSIDE, { id: 'a1', enabled: true }, false);
    expect(calls.toggled).toEqual([
      ['a1', true],
      ['a1', false],
    ]);
  });
});
