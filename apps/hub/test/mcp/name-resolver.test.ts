import { describe, expect, it } from 'vitest';
import { ToolError } from '../../src/extensions/mcp/tools/registry';
import { closestMatches, resolveNamed, type Naming } from '../../src/extensions/mcp/tools/targets';

interface Thing {
  readonly id: string;
  readonly name: string;
}

const NAMING: Naming<Thing> = {
  names: (thing) => [thing.name],
  label: (thing) => thing.name,
  id: (thing) => thing.id,
};

const THINGS: readonly Thing[] = [
  { id: 'aaa-1', name: 'TV' },
  { id: 'bbb-2', name: 'TV Box' },
  { id: 'ccc-3', name: 'Radio' },
  { id: 'ddd-4', name: 'Radio Alarm' },
  { id: 'eee-5', name: 'Fan' },
];

function refusal(wanted: string): ToolError {
  try {
    resolveNamed(THINGS, wanted, 'thing', NAMING);
  } catch (cause) {
    if (cause instanceof ToolError) {
      return cause;
    }
    throw cause;
  }
  throw new Error('no refusal');
}

describe('resolving a name', () => {
  it('prefers an exact name over longer names that contain it, ignoring case and spaces', () => {
    expect(resolveNamed(THINGS, '  tv ', 'thing', NAMING).id).toBe('aaa-1');
  });

  it('takes the id as an exact match', () => {
    expect(resolveNamed(THINGS, 'DDD-4', 'thing', NAMING).name).toBe('Radio Alarm');
  });

  it('falls back to the one name that contains the words', () => {
    expect(resolveNamed(THINGS, 'alarm', 'thing', NAMING).id).toBe('ddd-4');
  });

  it('does not search inside ids when no name matches', () => {
    expect(refusal('ddd').code).toBe('not_found');
  });

  it('lists the candidates when the words fit more than one', () => {
    const error = refusal('a');
    expect(error.code).toBe('invalid_request');
    expect(error.message).toBe(
      '"a" matches more than one thing: Radio (id ccc-3), Radio Alarm (id ddd-4), Fan (id eee-5); use the id',
    );
  });

  it('says nothing matched, as not found', () => {
    const error = refusal('kettle');
    expect(error.code).toBe('not_found');
    expect(error.message).toBe('There is no thing matching "kettle"');
  });

  it('works without ids and skips missing names', () => {
    const rows = [{ names: [null, 'Main'] }, { names: ['Spare', null] }];
    const naming: Naming<(typeof rows)[number]> = {
      names: (row) => row.names,
      label: (row) => row.names.join(''),
    };
    expect(closestMatches(rows, 'main', naming)).toEqual([rows[0]]);
    expect(closestMatches(rows, 'spar', naming)).toEqual([rows[1]]);
  });

  it('lets the full display name beat a bare device name shared by another row', () => {
    interface Computer {
      readonly id: string;
      readonly display: string;
      readonly name: string;
    }
    const computers: readonly Computer[] = [
      { id: 'hub-1', display: 'Living room DevL0rd-Laptop', name: 'DevL0rd-Laptop' },
      { id: 'client-2', display: 'DevL0rd-Laptop', name: 'DevL0rd-Laptop' },
    ];
    const naming: Naming<Computer> = {
      names: (row) => [row.display, row.name],
      label: (row) => row.display,
      id: (row) => row.id,
    };
    expect(resolveNamed(computers, 'devl0rd-laptop', 'computer', naming).id).toBe('client-2');
    expect(resolveNamed(computers, 'Living room DevL0rd-Laptop', 'computer', naming).id).toBe(
      'hub-1',
    );
    const twins = computers.map((row) => ({ ...row, display: 'DevL0rd-Laptop' }));
    expect(() => resolveNamed(twins, 'DevL0rd-Laptop', 'computer', naming)).toThrow(
      '"DevL0rd-Laptop" matches more than one computer: DevL0rd-Laptop (id hub-1), DevL0rd-Laptop (id client-2); use the id',
    );
  });
});
