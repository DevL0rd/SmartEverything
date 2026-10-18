import { MICROWAVE_KEYS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { DeviceLike } from './capability-choices';
import { deviceTemplates } from './device-templates';
import { templatesFor, unusedTemplates, type Template } from './templates';
import { DEVICES, capability } from './test-devices';
import { validateDraft, type ValidationChoices } from './validate';

const MICROWAVE_ID = '20000000-0000-4000-8000-000000000001';
const SCALE_ID = '20000000-0000-4000-8000-000000000002';
const ADGUARD_ID = '20000000-0000-4000-8000-000000000003';
const SYNC_ID = '20000000-0000-4000-8000-000000000004';
const BUTTON_ID = '20000000-0000-4000-8000-000000000005';

const MICROWAVE: DeviceLike = {
  id: MICROWAVE_ID,
  label: 'Kitchen microwave',
  kind: 'appliance',
  model: 'MW7300B',
  capabilities: [
    capability(MICROWAVE_KEYS.mode, 'Mode', 'read', { kind: 'text', maxLength: 40 }),
    capability(MICROWAVE_KEYS.power, 'Power', 'read', { kind: 'text', maxLength: 40 }),
    capability(MICROWAVE_KEYS.state, 'State', 'read', { kind: 'text', maxLength: 40 }),
    capability(MICROWAVE_KEYS.job, 'Job', 'read', { kind: 'text', maxLength: 40 }),
    capability(MICROWAVE_KEYS.door, 'Door', 'read', { kind: 'text', maxLength: 40 }),
  ],
};
const SCALE: DeviceLike = {
  id: SCALE_ID,
  label: 'Bathroom scale',
  kind: 'other',
  model: 'xiaomi.scales.400pgj',
  capabilities: [],
};
const ADGUARD: DeviceLike = {
  id: ADGUARD_ID,
  label: 'AdGuard Home',
  kind: 'dns_filter',
  model: 'AdGuard Home',
  capabilities: [capability('dns_protection', 'Ad blocking', 'read_write', { kind: 'boolean' })],
};
const SYNC: DeviceLike = {
  id: SYNC_ID,
  label: 'Syncthing',
  kind: 'file_sync',
  model: 'Syncthing',
  capabilities: [
    capability('sync_state', 'Sync', 'read', {
      kind: 'enum',
      options: ['in_sync', 'syncing', 'paused', 'error', 'offline', 'empty'],
    }),
  ],
};
const BUTTON: DeviceLike = {
  id: BUTTON_ID,
  label: 'Kitchen switch',
  kind: 'other',
  model: 'lumi.sensor_switch.v2',
  capabilities: [],
};
const ALL = [MICROWAVE, SCALE, ADGUARD, SYNC, BUTTON];

const CHOICES: ValidationChoices = {
  devices: [...DEVICES, ...ALL],
  sceneIds: [],
  profileIds: [],
  valueIds: [],
  groupIds: [],
  roomIds: [],
  automationIds: [],
  callable: [],
  inputs: [],
};

describe('templates for the device kinds with their own cards', () => {
  const templates = deviceTemplates(ALL);

  it('offers one set per kind', () => {
    expect(templates.map((template) => template.id)).toEqual([
      `microwave-ready:${MICROWAVE_ID}`,
      `microwave-inside:${MICROWAVE_ID}`,
      `weigh-in:${SCALE_ID}`,
      `adguard-off:${ADGUARD_ID}`,
      `sync-error:${SYNC_ID}`,
      `button:${BUTTON_ID}`,
    ]);
  });

  it('builds drafts that validate against the schema and the devices', () => {
    for (const template of templates) {
      expect(validateDraft(template.draft, CHOICES, { reusable: false }).valid).toBe(true);
    }
  });

  it('notices the finished job and then the door still closed ten minutes later', () => {
    const [ready, inside] = templates;
    expect(ready?.draft.automation.when).toEqual([
      expect.objectContaining({ field: MICROWAVE_KEYS.job, test: { is: 'eq', to: 'finished' } }),
    ]);
    expect(inside?.draft.automation.when).toEqual([
      expect.objectContaining({ field: MICROWAVE_KEYS.job, holdSeconds: 600 }),
    ]);
    expect(inside?.draft.automation.onlyIf).toEqual({
      compare: { device: MICROWAVE_ID, control: MICROWAVE_KEYS.door },
      test: { is: 'eq', to: 'closed' },
    });
  });

  it('reminds on Sundays, reacts to a single press and watches the plugin states', () => {
    const byId = (id: string): Template['draft']['automation'] | undefined =>
      templates.find((template) => template.id === id)?.draft.automation;
    expect(byId(`weigh-in:${SCALE_ID}`)?.when).toEqual([{ on: 'time', at: '08:00', days: [0] }]);
    expect(byId(`button:${BUTTON_ID}`)?.when).toEqual([
      expect.objectContaining({
        kind: 'button',
        subject: BUTTON_ID,
        match: { action: 'single_press' },
      }),
    ]);
    expect(byId(`adguard-off:${ADGUARD_ID}`)?.when).toEqual([
      expect.objectContaining({ field: 'dns_protection', test: { is: 'eq', to: false } }),
    ]);
    expect(byId(`sync-error:${SYNC_ID}`)?.when).toEqual([
      expect.objectContaining({ field: 'sync_state', test: { is: 'eq', to: 'error' } }),
    ]);
  });

  it('offers nothing for a microwave without a job reading or an AdGuard without blocking', () => {
    const bare = {
      ...MICROWAVE,
      capabilities: MICROWAVE.capabilities.filter((entry) => entry.key !== MICROWAVE_KEYS.job),
    };
    const silent = { ...ADGUARD, capabilities: [] };
    const doorless = {
      ...MICROWAVE,
      capabilities: MICROWAVE.capabilities.filter((entry) => entry.key !== MICROWAVE_KEYS.door),
    };
    expect(deviceTemplates([bare, silent])).toEqual([]);
    expect(deviceTemplates([doorless]).map((template) => template.id)).toEqual([
      `microwave-ready:${MICROWAVE_ID}`,
    ]);
  });

  it('joins the shared list and hides what is already saved', () => {
    const all = templatesFor(ALL);
    expect(all.map((template) => template.id)).toContain(`button:${BUTTON_ID}`);
    expect(
      unusedTemplates(all, ['press · kitchen switch']).map((template) => template.id),
    ).not.toContain(`button:${BUTTON_ID}`);
  });
});
