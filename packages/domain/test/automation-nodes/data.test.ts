import { describe, expect, it } from 'vitest';
import {
  buildRegistry,
  nodeCatalogue,
  registryProblems,
  type NodeKind,
} from '../../src/automation-nodes';
import { DATE_KINDS } from '../../src/automation-nodes/dates';
import { LIST_KINDS } from '../../src/automation-nodes/lists';
import { OBJECT_KINDS } from '../../src/automation-nodes/objects';
import { RANDOM_KINDS } from '../../src/automation-nodes/random';
import { UTIL_KINDS } from '../../src/automation-nodes/util';
import { VAR_KINDS } from '../../src/automation-nodes/vars';

const ALL = [
  ...LIST_KINDS,
  ...OBJECT_KINDS,
  ...DATE_KINDS,
  ...RANDOM_KINDS,
  ...VAR_KINDS,
  ...UTIL_KINDS,
];

function kindOf(id: string): NodeKind {
  const kind = ALL.find((candidate) => candidate.id === id);
  if (kind === undefined) throw new Error(`missing kind ${id}`);
  return kind;
}

describe('data node kinds', () => {
  it('form a valid registry with every id unique', () => {
    expect(registryProblems(ALL)).toEqual([]);
    expect(
      buildRegistry(ALL)
        .shipped()
        .map((kind) => kind.id),
    ).toEqual(ALL.map((kind) => kind.id));
    expect(kindOf('var.secret')).toMatchObject({ tier: 'v1.1', access: 'owner' });
  });

  it('ship the v1 ids of the catalog', () => {
    expect(LIST_KINDS.map((kind) => kind.id)).toEqual([
      'list.make',
      'list.get',
      'list.length',
      'list.add',
      'list.remove',
      'list.filter',
      'list.find',
      'list.any',
      'list.all',
      'list.field',
      'list.cycle',
    ]);
    expect(OBJECT_KINDS.map((kind) => kind.id)).toEqual([
      'object.make',
      'object.get',
      'object.set',
      'object.parse_json',
      'object.to_json',
    ]);
    expect(DATE_KINDS.map((kind) => kind.id)).toEqual([
      'date.now',
      'date.today_at',
      'date.parse',
      'date.format',
      'date.add',
      'date.difference',
      'date.part',
      'date.duration',
      'date.since',
    ]);
    expect(RANDOM_KINDS.map((kind) => kind.id)).toEqual(['random.number', 'random.choice']);
    expect(VAR_KINDS.map((kind) => kind.id)).toEqual([
      'var.secret',
      'var.get',
      'var.set',
      'var.change',
      'var.constant',
    ]);
    expect(UTIL_KINDS.map((kind) => kind.id)).toEqual(['util.convert', 'util.lookup']);
  });

  it('keeps lists, objects and utilities pure and the rest by class', () => {
    for (const kind of [...LIST_KINDS, ...OBJECT_KINDS, ...UTIL_KINDS]) {
      expect(kind.class).toBe('pure');
      expect(kind.exits).toEqual([]);
    }
    expect(kindOf('date.now').class).toBe('read');
    expect(kindOf('date.parse').class).toBe('pure');
    expect(RANDOM_KINDS.every((kind) => kind.class === 'read')).toBe(true);
    expect(kindOf('var.get').class).toBe('read');
    expect(kindOf('var.constant').class).toBe('pure');
    expect(kindOf('var.constant').effect).toBeUndefined();
  });

  it('declares the zone read port on date.since and date.today_at only', () => {
    expect(kindOf('date.since').reads?.({})).toContain('home:zone');
    expect(kindOf('date.today_at').reads?.({})).toContain('home:zone');
    expect(kindOf('date.now').reads?.({})).toEqual(['clock:now']);
    expect(
      DATE_KINDS.filter((kind) => kind.reads?.({}).includes('home:zone') === true),
    ).toHaveLength(2);
  });

  it('seeds random through a read port and tracks no-repeat history', () => {
    expect(kindOf('random.number').reads?.({})).toEqual(['random:seed']);
    expect(kindOf('random.choice').reads?.({})).toEqual(['random:seed']);
    expect(kindOf('random.choice').reads?.({ noRepeat: { lit: true } })).toEqual([
      'random:seed',
      'random:history',
    ]);
  });

  it('puts variable writes on the effect budget class for durable targets', () => {
    expect(kindOf('var.set').effect).toEqual({ retry: 'idempotent', budget: 'effects_if_durable' });
    expect(kindOf('var.change').effect).toEqual({
      retry: 'relative',
      budget: 'effects_if_durable',
    });
    expect(kindOf('var.get').effect).toBeUndefined();
  });

  it('names the variable a read depends on', () => {
    const get = kindOf('var.get');
    expect(get.reads?.({})).toEqual(['run:*']);
    expect(get.reads?.({ name: { lit: 'step' } })).toEqual(['run:step']);
    expect(get.reads?.({ source: { lit: 'automation' }, name: { lit: 'step' } })).toEqual([
      'persistent:step',
    ]);
    expect(
      get.reads?.({ source: { lit: 'automation' }, name: { wire: { from: 'x', port: 'name' } } }),
    ).toEqual(['persistent:*']);
    expect(get.reads?.({ source: { lit: 'home' }, value: { lit: 'abc' } })).toEqual(['value:abc']);
    expect(get.reads?.({ source: { lit: 'home' } })).toEqual(['value:*']);
    expect(get.reads?.({ source: { lit: 'home' }, value: { lit: 7 } })).toEqual(['value:*']);
  });

  it('offers next and previous with wrap or clamp on var.change', () => {
    const change = kindOf('var.change');
    const op = change.inputs.find((port) => port.name === 'op');
    const edge = change.inputs.find((port) => port.name === 'edge');
    expect(op?.type).toMatchObject({ t: 'choice' });
    const ids = op?.type.t === 'choice' ? op.type.options.map((option) => option.id) : [];
    expect(ids).toEqual(expect.arrayContaining(['next', 'previous', 'toggle', 'set_field']));
    expect(edge?.default).toBe('wrap');
    expect(change.outputs.map((port) => port.name)).toEqual(['value', 'previous', 'wrapped']);
  });

  it('projects into the catalogue by group and query', () => {
    const registry = buildRegistry(ALL);
    expect(nodeCatalogue(registry, { group: 'lists' })).toHaveLength(LIST_KINDS.length);
    expect(nodeCatalogue(registry, { query: 'weekend' }).map((entry) => entry.id)).toEqual([
      'date.part',
    ]);
    expect(nodeCatalogue(registry, { kind: 'var.set' })[0]?.effect?.budget).toBe(
      'effects_if_durable',
    );
  });

  it('gives every kind a non-empty summary', () => {
    for (const kind of ALL) expect(kind.summary.trim()).not.toBe('');
  });
});
