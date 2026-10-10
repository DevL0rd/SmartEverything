import { describe, expect, it } from 'vitest';
import { templatesFor, unusedTemplates } from './templates';
import { validateDraft } from './validate';
import {
  DEVICES,
  DOOR,
  LAMP,
  LEAK,
  PURIFIER,
  SENSOR,
  capability,
  door,
  lamp,
  purifier,
} from './test-devices';

describe('templates from the person’s own devices', () => {
  const templates = templatesFor(DEVICES);

  it('offers the presets the devices make possible', () => {
    expect(templates.map((template) => template.id)).toEqual([
      `bedtime:${PURIFIER}`,
      'sunset-lights',
      `leak:${LEAK}`,
      `night:${SENSOR}`,
      `air:${PURIFIER}`,
    ]);
    expect(templates.map((template) => template.title)).toEqual([
      'Bedroom purifier to sleep at bedtime',
      'Lights on at sunset',
      'Notify on leak from Laundry leak sensor',
      'Hallway light on when Landing sensor sees motion at night',
      'Bedroom purifier on when PM2.5 rises above 35',
    ]);
  });

  it('builds drafts that validate against the schema and the devices', () => {
    for (const template of templates) {
      expect(
        validateDraft(template.draft, { devices: DEVICES, sceneIds: [], profileIds: [] }).valid,
      ).toBe(true);
    }
  });

  it('sets the purifier to its sleep mode and the lights on', () => {
    expect(templates[0]?.draft.actions).toEqual([
      { type: 'command', deviceId: PURIFIER, capability: 'purifier_mode', value: 'sleep' },
    ]);
    expect(templates[1]?.draft.actions).toEqual([
      { type: 'command', deviceId: LAMP, capability: 'power', value: true },
    ]);
    expect(templates[3]?.draft.conditions).toEqual([
      { type: 'time_window', after: '22:00', before: '06:00' },
    ]);
  });

  it('uses a door when there is no motion sensor', () => {
    const night = templatesFor([lamp, door]).find((template) => template.id.startsWith('night'));
    expect(night?.title).toBe('Hallway light on when Front door opens at night');
    expect(night?.draft.triggers).toEqual([
      {
        type: 'state',
        deviceId: DOOR,
        capability: 'contact',
        comparison: { operator: 'eq', value: true },
      },
    ]);
  });

  it('offers nothing a device cannot do', () => {
    const quiet = {
      ...purifier,
      capabilities: [
        capability('purifier_mode', 'Mode', 'read_write', { kind: 'enum', options: ['auto'] }),
      ],
    };
    const readOnly = {
      ...purifier,
      capabilities: [
        capability('purifier_mode', 'Mode', 'read', { kind: 'enum', options: ['sleep'] }),
      ],
    };
    expect(templatesFor([quiet, readOnly, door])).toEqual([]);
    expect(templatesFor([])).toEqual([]);
  });

  it('hides templates already saved under the same name', () => {
    expect(
      unusedTemplates(templates, ['lights on at sunset']).map((template) => template.id),
    ).not.toContain('sunset-lights');
  });
});
