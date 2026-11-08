import { describe, expect, it } from 'vitest';
import type { FlowType, Wire } from '@smarteverything/domain';
import { NO_FIELDS, NO_RECORD, UNKNOWN_FIELDS, recordFieldsOf } from './record-fields-model';

const PERSON: FlowType = {
  t: 'record',
  fields: {
    name: { t: 'text' },
    home: { t: 'optional', of: { t: 'record', fields: { room: { t: 'text' } } } },
  },
};

const WIRED = { wire: { from: 'people', port: 'list' } };

function typed(type: FlowType): (wire: Wire) => FlowType {
  return () => type;
}

describe('record fields', () => {
  it('lists the item fields of a wired list of records, top level only', () => {
    const found = recordFieldsOf(WIRED, typed({ t: 'list', of: PERSON }), false);
    expect(found).toEqual({ t: 'fields', fields: ['name', 'home'] });
  });

  it('lists dotted paths of a wired record for a single path pick', () => {
    const found = recordFieldsOf(WIRED, typed(PERSON), false);
    expect(found).toEqual({ t: 'fields', fields: ['name', 'home', 'home.room'] });
  });

  it('lists top level keys of a record for a multiple pick', () => {
    const found = recordFieldsOf(WIRED, typed(PERSON), true);
    expect(found).toEqual({ t: 'fields', fields: ['name', 'home'] });
  });

  it('reads the fields of a typed literal', () => {
    const list = { lit: [{ name: 'Ana', age: 3 }, { name: 'Ben', pet: 'cat' }, 'skip'] };
    expect(recordFieldsOf(list, typed({ t: 'any' }), false)).toEqual({
      t: 'fields',
      fields: ['name', 'age', 'pet'],
    });
    const record = { lit: { detection: { label: 'person' }, at: 1 } };
    expect(recordFieldsOf(record, typed({ t: 'any' }), false)).toEqual({
      t: 'fields',
      fields: ['detection', 'detection.label', 'at'],
    });
  });

  it('says why when there is nothing to read fields from', () => {
    expect(recordFieldsOf(undefined, typed(PERSON), false)).toEqual({
      t: 'none',
      reason: NO_RECORD,
    });
    expect(recordFieldsOf(WIRED, typed({ t: 'any' }), false)).toEqual({
      t: 'none',
      reason: UNKNOWN_FIELDS,
    });
    expect(recordFieldsOf({ lit: [] }, typed({ t: 'any' }), false)).toEqual({
      t: 'none',
      reason: NO_FIELDS,
    });
  });
});
