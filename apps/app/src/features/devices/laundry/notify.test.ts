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
const { setTemplate, templateStates } = await import('./notify');
const { washerDevice } = await import('./washer-fixture');

const [DONE] = templatesFor([washerDevice()]);

describe('notify me switches', () => {
  it('offers the cycle-finished template first for the washer', () => {
    expect(DONE?.id.startsWith('laundry-done:')).toBe(true);
  });

  it('labels each row by its event, without repeating the machine name', () => {
    const labels = templatesFor([washerDevice()]).map((template) => template.short);
    expect(labels.slice(0, 2)).toEqual(['Finished', 'Fault']);
    expect(labels.every((label) => label !== undefined && !label.includes('Washing'))).toBe(true);
  });

  it('matches stored automations to templates by name, ignoring case', () => {
    expect(
      templateStates(
        ['Laundry done · A', 'Fault · A'],
        [
          { id: 'x1', name: 'laundry DONE · a', enabled: true },
          { id: 'x2', name: 'Other', enabled: false },
        ],
      ),
    ).toEqual([{ id: 'x1', enabled: true }, null]);
  });

  it('creates an enabled automation from the template the first time it is switched on', async () => {
    if (DONE === undefined) throw new Error('template missing');
    calls.saved.length = 0;
    await setTemplate(DONE, null, true);
    expect(calls.saved).toEqual([
      {
        automationId: null,
        name: DONE.draft.name,
        enabled: true,
        definition: DONE.draft.automation,
      },
    ]);
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
