import { describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => {
  const saved: unknown[] = [];
  const toggled: unknown[] = [];
  return { saved, toggled };
});

vi.mock('../../../api/automations', () => ({
  createAutomation: (save: unknown): Promise<void> => {
    calls.saved.push(save);
    return Promise.resolve();
  },
  setAutomationEnabled: (id: string, enabled: boolean): Promise<void> => {
    calls.toggled.push([id, enabled]);
    return Promise.resolve();
  },
}));

const { notifyTemplates, setTemplate, templateStates } = await import('./notify');
const { APPLIANCES } = await import('../../automations/model/templates/template-fixtures');

const MICROWAVE = APPLIANCES.find((device) => device.id === 'microwave');
if (MICROWAVE === undefined) throw new Error('microwave fixture missing');

const [DONE] = notifyTemplates(MICROWAVE);

describe('notify me switches', () => {
  it('offers the food-ready template first for the microwave', () => {
    expect(DONE?.id.startsWith('microwave-ready:')).toBe(true);
  });

  it('labels each row by its event, without repeating the appliance name', () => {
    const labels = notifyTemplates(MICROWAVE).map((template) => template.short);
    expect(labels).toEqual(['Food is ready', 'Food still inside']);
  });

  it('matches stored automations to templates by name, ignoring case', () => {
    expect(
      templateStates(
        ['Food is ready · A', 'Food still inside · A'],
        [
          { id: 'x1', name: 'food IS READY · a', enabled: true },
          { id: 'x2', name: 'Other', enabled: false },
        ],
      ),
    ).toEqual([{ id: 'x1', enabled: true }, null]);
  });

  it('creates an enabled automation from the template the first time it is switched on', async () => {
    if (DONE === undefined) throw new Error('template missing');
    calls.saved.length = 0;
    await setTemplate(DONE, null, true);
    expect(calls.saved).toEqual([{ name: DONE.name, enabled: true, definition: DONE.build() }]);
  });

  it('enables and disables the automation that already exists', async () => {
    if (DONE === undefined) throw new Error('template missing');
    calls.toggled.length = 0;
    await setTemplate(DONE, { id: 'a1', enabled: false }, true);
    await setTemplate(DONE, { id: 'a1', enabled: true }, false);
    expect(calls.toggled).toEqual([
      ['a1', true],
      ['a1', false],
    ]);
  });

  it('does nothing when switching off an automation that was never made', async () => {
    if (DONE === undefined) throw new Error('template missing');
    calls.saved.length = 0;
    calls.toggled.length = 0;
    await setTemplate(DONE, null, false);
    expect([...calls.saved, ...calls.toggled]).toEqual([]);
  });
});
