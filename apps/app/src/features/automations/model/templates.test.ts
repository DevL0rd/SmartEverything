import { describe, expect, it } from 'vitest';
import { templatesFor, unusedTemplates } from './templates';
import { validateDraft, type ValidationChoices } from './validate';
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

const CHOICES: ValidationChoices = {
  devices: DEVICES,
  sceneIds: [],
  profileIds: [],
  valueIds: [],
  groupIds: [],
  roomIds: [],
  automationIds: [],
  callable: [],
  inputs: [],
};

describe('templates from the person’s own devices', () => {
  const templates = templatesFor(DEVICES);

  function templateById(id: string): (typeof templates)[number] | undefined {
    return templates.find((template) => template.id === id);
  }

  it('offers the presets the devices make possible', () => {
    expect(templates.map((template) => [template.id, template.title])).toEqual([
      [`bedtime:${PURIFIER}`, 'Bedroom purifier to sleep at bedtime'],
      [`air:${PURIFIER}`, 'Bedroom purifier on when PM2.5 rises above 35'],
      ['sunset-lights', 'Lights on at sunset'],
      [`leak:${LEAK}`, 'Notify on leak from Laundry leak sensor'],
      [`night:${SENSOR}`, 'Hallway light on when Landing sensor sees motion at night'],
    ]);
  });

  it('builds drafts that validate against the schema and the devices', () => {
    for (const template of templates) {
      expect(validateDraft(template.draft, CHOICES, { reusable: false }).valid).toBe(true);
    }
  });

  it('sets the purifier to its sleep mode and the lights on', () => {
    expect(templateById(`bedtime:${PURIFIER}`)?.draft.automation.steps).toEqual([
      { do: 'set', target: { device: PURIFIER }, control: 'purifier_mode', to: 'sleep' },
    ]);
    expect(templateById('sunset-lights')?.draft.automation.steps).toEqual([
      { do: 'set', target: { devices: [LAMP] }, control: 'power', to: true },
    ]);
    expect(templateById(`night:${SENSOR}`)?.draft.automation.onlyIf).toEqual({
      time: { after: '22:00', before: '06:00' },
    });
  });

  it('uses a door when there is no motion sensor', () => {
    const night = templatesFor([lamp, door]).find((template) => template.id.startsWith('night'));
    expect(night?.title).toBe('Hallway light on when Front door opens at night');
    expect(night?.draft.automation.when).toEqual([
      {
        on: 'signal',
        source: 'device',
        kind: 'state',
        subject: DOOR,
        field: 'contact',
        test: { is: 'eq', to: true },
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
