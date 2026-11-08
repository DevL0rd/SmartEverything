import { describe, expect, it } from 'vitest';
import { DEVICE_KINDS } from '../../src/devices';
import { kindProblems } from '../../src/automation-nodes/registry';
import { HOME_STRUCTURE_NODE_KINDS, PEOPLE_NODE_KINDS } from '../../src/automation-nodes/people';

const query = [...HOME_STRUCTURE_NODE_KINDS, ...PEOPLE_NODE_KINDS].find(
  (entry) => entry.id === 'device.query',
);

function port(name: string): NonNullable<typeof query>['inputs'][number] | undefined {
  return query?.inputs.find((input) => input.name === name);
}

describe('device.query filters', () => {
  it('is a valid read kind that keeps every earlier port', () => {
    expect(query).toBeDefined();
    if (query === undefined) return;
    expect(kindProblems(query)).toEqual([]);
    expect(query.class).toBe('read');
    for (const name of ['room', 'group', 'families', 'roles', 'labels', 'where', 'availableOnly']) {
      expect(port(name)).toBeDefined();
    }
    expect(port('room')?.type).toEqual({ t: 'optional', of: { t: 'ref', of: 'room' } });
  });

  it('takes several rooms from the room picker', () => {
    expect(port('rooms')).toMatchObject({
      type: { t: 'list', of: { t: 'ref', of: 'room' } },
      required: false,
      ui: { optionsFrom: 'rooms', multiple: true },
    });
  });

  it('offers every device kind once as a choice list', () => {
    const kinds = port('kinds');
    expect(kinds?.ui).toEqual({ multiple: true });
    const type = kinds?.type;
    expect(type).toMatchObject({ t: 'list', of: { t: 'choice' } });
    if (type?.t !== 'list' || type.of.t !== 'choice') return;
    const ids = type.of.options.map((option) => option.id);
    expect(ids).toEqual([...DEVICE_KINDS]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('picks the control from the control picker without a default', () => {
    const capability = port('capability');
    expect(capability).toMatchObject({
      type: { t: 'text' },
      required: false,
      ui: { optionsFrom: 'device.controls' },
    });
    expect(capability?.default).toBeUndefined();
  });

  it('keeps families and roles as multiple choice lists', () => {
    expect(port('families')?.ui).toEqual({ optionsFrom: 'device.families', multiple: true });
    expect(port('roles')?.ui).toEqual({ optionsFrom: 'device.roles', multiple: true });
  });
});
