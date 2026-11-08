import { describe, expect, it } from 'vitest';
import { kindLookupOf } from '../data/kind-lookup';
import { ARRIVED_KIND_ID, arrivedKind, kindRow } from '../../../test-support/plugin-kinds';
import { automation, idOf } from '../model/graph/graph-scene-fixtures';
import { triggerFieldsOf } from './editor-test';

const PROGRAM = automation([], {
  triggers: [
    {
      id: idOf('arrived'),
      key: 'arrived',
      kind: ARRIVED_KIND_ID,
      ports: { where: { lit: { group: 'kitchen' } } },
    },
  ],
});

describe('triggerFieldsOf', () => {
  it('lists what a plugin trigger hands over for a test', () => {
    const lookup = kindLookupOf([kindRow('active', arrivedKind())]);
    expect(triggerFieldsOf(PROGRAM, lookup).map((field) => field.name)).toEqual(['who']);
  });

  it('lists nothing for a trigger the lookup does not know', () => {
    expect(triggerFieldsOf(PROGRAM, kindLookupOf([]))).toEqual([]);
    expect(triggerFieldsOf(null, kindLookupOf([]))).toEqual([]);
  });
});
