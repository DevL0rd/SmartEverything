import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  EXPLICIT_CONVERSIONS,
  IMPLICIT_COERCIONS,
  conversionsOffered,
  hasUnresolvedGenerics,
  holdsSecret,
  implicitCoercionOf,
  isAssignable,
  isTemplateRenderable,
  resolveGenerics,
  substituteGenerics,
  typeDisplayName,
} from '../../src/automation-v3/type-rules';
import { FLOW_TYPE, REF_KINDS, type FlowType } from '../../src/automation-v3/types';

const BOOLEAN: FlowType = { t: 'boolean' };
const NUMBER: FlowType = { t: 'number' };
const INTEGER: FlowType = { t: 'number', integer: true };
const TEXT: FlowType = { t: 'text' };
const DURATION: FlowType = { t: 'duration' };
const INSTANT: FlowType = { t: 'instant' };
const TIME: FlowType = { t: 'timeOfDay' };
const DATE: FlowType = { t: 'date' };
const COLOR: FlowType = { t: 'color' };
const ERROR: FlowType = { t: 'error' };
const ANY: FlowType = { t: 'any' };
const SECRET: FlowType = { t: 'ref', of: 'secret' };
const DEVICE: FlowType = { t: 'ref', of: 'device' };
const LIGHT: FlowType = { t: 'ref', of: 'device', capabilities: ['power', 'brightness'] };
const SWITCH: FlowType = { t: 'ref', of: 'device', capabilities: ['power'] };
const TARGET: FlowType = { t: 'ref', of: 'target' };
const CHOICE_AB: FlowType = {
  t: 'choice',
  options: [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta' },
  ],
};
const CHOICE_ABC: FlowType = {
  t: 'choice',
  options: [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta' },
    { id: 'c', label: 'Gamma' },
  ],
};
const param = (name: string): FlowType => ({ t: 'param', name });
const list = (of: FlowType): FlowType => ({ t: 'list', of });
const optional = (of: FlowType): FlowType => ({ t: 'optional', of });
const record = (fields: Readonly<Record<string, FlowType>>, values?: FlowType): FlowType =>
  values === undefined ? { t: 'record', fields } : { t: 'record', fields, values };
const openRecord = (values: FlowType): FlowType => ({ t: 'record', values });

const SCALARS: readonly FlowType[] = [
  BOOLEAN,
  NUMBER,
  TEXT,
  DURATION,
  INSTANT,
  TIME,
  DATE,
  COLOR,
  ERROR,
];

const UNIVERSE: readonly FlowType[] = [
  ...SCALARS,
  INTEGER,
  { t: 'number', min: 0, max: 10 },
  { t: 'number', min: 0 },
  { t: 'number', max: 5, unit: 'percent' },
  { t: 'number', integer: true, unit: 'percent' },
  ANY,
  CHOICE_AB,
  CHOICE_ABC,
  ...REF_KINDS.map((of): FlowType => ({ t: 'ref', of })),
  LIGHT,
  SWITCH,
  param('item'),
  param('other'),
  ...[TEXT, NUMBER, INTEGER, ANY, SECRET, LIGHT, DEVICE].flatMap((inner) => [
    list(inner),
    optional(inner),
  ]),
  optional(list(NUMBER)),
  list(optional(NUMBER)),
  optional(optional(TEXT)),
  record({}),
  record({ level: NUMBER }),
  record({ level: INTEGER }),
  record({ level: NUMBER, name: TEXT }),
  record({ level: optional(NUMBER) }),
  record({ level: NUMBER }, TEXT),
  record({}, TEXT),
  record({}, ANY),
  openRecord(NUMBER),
  openRecord(INTEGER),
  openRecord(SECRET),
];

type NumberType = Extract<FlowType, { readonly t: 'number' }>;

const widenNumber = (type: NumberType): readonly FlowType[] => {
  const { integer, min, max, unit } = type;
  return [
    ...(integer === undefined ? [] : [{ t: 'number' as const, min, max, unit }]),
    ...(min === undefined ? [] : [{ t: 'number' as const }]),
    ...(max === undefined ? [] : [{ t: 'number' as const, integer, min }]),
    ...(unit === undefined ? [] : [{ t: 'number' as const, integer, min, max }]),
  ];
};

const widenStructure = (type: FlowType): readonly FlowType[] => {
  if (type.t === 'number') return widenNumber(type);
  if (type.t === 'ref') {
    return type.capabilities === undefined ? [] : [{ t: 'ref' as const, of: type.of }];
  }
  if (type.t === 'list') {
    return [
      ...(widenOptions(type.of).includes(ANY) ? [list(ANY)] : []),
      ...widenOptions(type.of).map(list),
    ];
  }
  if (type.t === 'optional') return widenOptions(type.of).map(optional);
  if (type.t === 'choice') return [CHOICE_ABC];
  return type.t === 'record' && !holdsSecret(type) ? [record({})] : [];
};

const widenOptions = (type: FlowType): readonly FlowType[] => [
  ...(type.t === 'optional' || holdsSecret(type) ? [] : [ANY]),
  ...widenStructure(type),
];

const widen = (type: FlowType, pick: number): FlowType => {
  const options = [...widenOptions(type), optional(type)];
  return options[pick % options.length] ?? type;
};

const typeArbitrary: fc.Arbitrary<FlowType> = fc.letrec<{ type: FlowType }>((tie) => ({
  type: fc.oneof(
    { depthSize: 'small', maxDepth: 3 },
    fc.constantFrom(...SCALARS, ANY, INTEGER, SECRET, LIGHT, DEVICE, CHOICE_AB, param('item')),
    fc.record({
      t: fc.constant('number' as const),
      integer: fc.boolean(),
      min: fc.integer({ min: -5, max: 5 }),
      max: fc.integer({ min: 6, max: 20 }),
    }),
    fc.constantFrom(...REF_KINDS).map((of): FlowType => ({ t: 'ref', of })),
    tie('type').map(list),
    tie('type').map(optional),
    fc
      .dictionary(fc.constantFrom('a', 'b', 'c'), tie('type'), { maxKeys: 3 })
      .map((fields) => record(fields)),
    fc.tuple(tie('type')).map(([values]) => openRecord(values)),
  ),
})).type;

describe('the implicit coercion table', () => {
  it('lists exactly the six coercions of the language', () => {
    expect(IMPLICIT_COERCIONS.map((row) => [row.id, row.where])).toEqual([
      ['integerToNumber', 'everywhere'],
      ['valueToOptional', 'everywhere'],
      ['deviceNarrowing', 'everywhere'],
      ['devicesToTarget', 'everywhere'],
      ['listToListOfAny', 'everywhere'],
      ['renderToText', 'template'],
    ]);
  });

  it('classifies each coercion with its table id', () => {
    expect(implicitCoercionOf(INTEGER, NUMBER)).toBe('integerToNumber');
    expect(implicitCoercionOf(TEXT, optional(TEXT))).toBe('valueToOptional');
    expect(implicitCoercionOf(LIGHT, DEVICE)).toBe('deviceNarrowing');
    expect(implicitCoercionOf(DEVICE, TARGET)).toBe('devicesToTarget');
    expect(implicitCoercionOf(list(LIGHT), TARGET)).toBe('devicesToTarget');
    expect(implicitCoercionOf(list(TEXT), list(ANY))).toBe('listToListOfAny');
    expect(implicitCoercionOf(NUMBER, TEXT, 'template')).toBe('renderToText');
  });

  it('classifies nothing when the types already match or do not fit', () => {
    expect(implicitCoercionOf(NUMBER, NUMBER)).toBeNull();
    expect(implicitCoercionOf(list(ANY), list(ANY))).toBeNull();
    expect(implicitCoercionOf(NUMBER, TEXT)).toBeNull();
    expect(implicitCoercionOf(TEXT, NUMBER, 'template')).toBeNull();
    expect(implicitCoercionOf(DEVICE, DEVICE)).toBeNull();
    expect(implicitCoercionOf(INTEGER, INTEGER)).toBeNull();
    expect(implicitCoercionOf(SWITCH, LIGHT)).toBeNull();
    expect(implicitCoercionOf(SECRET, SECRET)).toBeNull();
  });

  it('allows a scalar into another type only when it is the same type', () => {
    for (const from of SCALARS) {
      for (const to of SCALARS) {
        expect(isAssignable(from, to)).toBe(
          from.t === to.t || (from.t === 'number' && to.t === 'number'),
        );
      }
    }
  });

  it('never turns a number into on/off, nor text into anything but text', () => {
    expect(isAssignable(NUMBER, BOOLEAN)).toBe(false);
    expect(conversionsOffered(NUMBER, BOOLEAN)).toEqual([]);
    expect(isAssignable(TEXT, NUMBER)).toBe(false);
    expect(isAssignable(DURATION, NUMBER)).toBe(false);
    expect(isAssignable(NUMBER, DURATION)).toBe(false);
  });

  it('accepts renderable values as text only inside templates', () => {
    const renderable = [BOOLEAN, NUMBER, DURATION, INSTANT, TIME, DATE, CHOICE_AB, DEVICE, LIGHT];
    for (const from of renderable) {
      expect(isAssignable(from, TEXT)).toBe(false);
      expect(isAssignable(from, TEXT, 'template')).toBe(true);
      expect(isTemplateRenderable(from)).toBe(true);
    }
    for (const from of [
      list(TEXT),
      record({}),
      ANY,
      COLOR,
      ERROR,
      optional(TEXT),
      param('item'),
      SECRET,
    ]) {
      expect(isAssignable(from, TEXT, 'template')).toBe(false);
      expect(isTemplateRenderable(from)).toBe(false);
    }
  });

  it('checks every reference kind except secret as renderable', () => {
    for (const of of REF_KINDS) {
      expect(isTemplateRenderable({ t: 'ref', of })).toBe(of !== 'secret');
    }
  });
});

describe('assignability of refinements, options and references', () => {
  it('lets an integer into a number but not the reverse', () => {
    expect(isAssignable(INTEGER, NUMBER)).toBe(true);
    expect(isAssignable(NUMBER, INTEGER)).toBe(false);
  });

  it('requires bounds and unit to fit', () => {
    const percent: FlowType = { t: 'number', min: 0, max: 100, unit: 'percent' };
    expect(isAssignable({ t: 'number', min: 10, max: 20, unit: 'percent' }, percent)).toBe(true);
    expect(isAssignable({ t: 'number', min: 10, max: 20, unit: 'seconds' }, percent)).toBe(false);
    expect(isAssignable({ t: 'number', min: -1, max: 20, unit: 'percent' }, percent)).toBe(false);
    expect(isAssignable({ t: 'number', min: 0, max: 101, unit: 'percent' }, percent)).toBe(false);
    expect(isAssignable({ t: 'number', max: 20, unit: 'percent' }, percent)).toBe(false);
    expect(isAssignable({ t: 'number', min: 0, unit: 'percent' }, percent)).toBe(false);
    expect(isAssignable(percent, NUMBER)).toBe(true);
  });

  it('keeps choices to a subset of options', () => {
    expect(isAssignable(CHOICE_AB, CHOICE_ABC)).toBe(true);
    expect(isAssignable(CHOICE_ABC, CHOICE_AB)).toBe(false);
    expect(isAssignable(CHOICE_AB, TEXT)).toBe(false);
  });

  it('narrows a device reference only downwards', () => {
    expect(isAssignable(LIGHT, DEVICE)).toBe(true);
    expect(isAssignable(LIGHT, SWITCH)).toBe(true);
    expect(isAssignable(SWITCH, LIGHT)).toBe(false);
    expect(isAssignable(DEVICE, LIGHT)).toBe(false);
    expect(isAssignable(DEVICE, { t: 'ref', of: 'device', capabilities: [] })).toBe(true);
  });

  it('never mixes reference kinds, except a device filling a target', () => {
    for (const from of REF_KINDS) {
      for (const to of REF_KINDS) {
        expect(isAssignable({ t: 'ref', of: from }, { t: 'ref', of: to })).toBe(
          from === to || (from === 'device' && to === 'target'),
        );
      }
    }
  });

  it('lets a device or a list of devices fill a target, and nothing else of a list', () => {
    expect(isAssignable(DEVICE, TARGET)).toBe(true);
    expect(isAssignable(LIGHT, TARGET)).toBe(true);
    expect(isAssignable(list(DEVICE), TARGET)).toBe(true);
    expect(isAssignable(list(SWITCH), optional(TARGET))).toBe(true);
    expect(isAssignable(list(TARGET), TARGET)).toBe(false);
    expect(isAssignable(list({ t: 'ref', of: 'room' }), TARGET)).toBe(false);
    expect(isAssignable(list(TEXT), TARGET)).toBe(false);
    expect(isAssignable(TARGET, DEVICE)).toBe(false);
    expect(isAssignable(optional(DEVICE), TARGET)).toBe(false);
  });

  it('lets anything but a secret or an optional into any', () => {
    for (const from of [...SCALARS, CHOICE_AB, LIGHT, list(TEXT), record({})]) {
      expect(isAssignable(from, ANY)).toBe(true);
    }
    expect(isAssignable(optional(TEXT), ANY)).toBe(false);
    expect(isAssignable(ANY, TEXT)).toBe(false);
    expect(isAssignable(ANY, ANY)).toBe(true);
  });

  it('wraps into optional and never unwraps implicitly', () => {
    expect(isAssignable(TEXT, optional(TEXT))).toBe(true);
    expect(isAssignable(optional(TEXT), optional(TEXT))).toBe(true);
    expect(isAssignable(INTEGER, optional(NUMBER))).toBe(true);
    expect(isAssignable(optional(INTEGER), optional(NUMBER))).toBe(true);
    expect(isAssignable(optional(TEXT), TEXT)).toBe(false);
    expect(isAssignable(NUMBER, optional(TEXT))).toBe(false);
    expect(isAssignable(TEXT, optional(optional(TEXT)))).toBe(true);
    expect(isAssignable(optional(optional(TEXT)), optional(TEXT))).toBe(false);
  });

  it('keeps lists covariant and lets any list into list of any', () => {
    expect(isAssignable(list(INTEGER), list(NUMBER))).toBe(true);
    expect(isAssignable(list(NUMBER), list(INTEGER))).toBe(false);
    expect(isAssignable(list(TEXT), list(ANY))).toBe(true);
    expect(isAssignable(list(ANY), list(TEXT))).toBe(false);
    expect(isAssignable(list(TEXT), TEXT)).toBe(false);
    expect(isAssignable(TEXT, list(TEXT))).toBe(false);
  });

  it('compares generic parameters by name', () => {
    expect(isAssignable(param('item'), param('item'))).toBe(true);
    expect(isAssignable(param('item'), param('other'))).toBe(false);
    expect(isAssignable(param('item'), TEXT)).toBe(false);
  });
});

describe('record assignability', () => {
  it('needs every target field present and assignable', () => {
    expect(isAssignable(record({ level: INTEGER, name: TEXT }), record({ level: NUMBER }))).toBe(
      true,
    );
    expect(isAssignable(record({ level: NUMBER }), record({ level: INTEGER }))).toBe(false);
    expect(isAssignable(record({}), record({ level: NUMBER }))).toBe(false);
    expect(isAssignable(openRecord(NUMBER), record({ level: NUMBER }))).toBe(false);
    expect(isAssignable(record({ level: NUMBER }), record({ level: optional(NUMBER) }))).toBe(true);
    expect(isAssignable(openRecord(TEXT), { t: 'record' })).toBe(true);
    expect(isAssignable(TEXT, record({}))).toBe(false);
  });

  it('checks open values on every unnamed field', () => {
    expect(isAssignable(openRecord(INTEGER), openRecord(NUMBER))).toBe(true);
    expect(isAssignable(openRecord(NUMBER), openRecord(INTEGER))).toBe(false);
    expect(isAssignable(record({ a: INTEGER }, INTEGER), openRecord(NUMBER))).toBe(true);
    expect(isAssignable(record({ a: TEXT }, INTEGER), openRecord(NUMBER))).toBe(false);
    expect(isAssignable(record({ a: TEXT }, NUMBER), record({ a: TEXT }, ANY))).toBe(true);
    expect(isAssignable(record({ a: TEXT }), openRecord(TEXT))).toBe(false);
    expect(isAssignable(record({}), openRecord(TEXT))).toBe(false);
    expect(isAssignable(record({ a: TEXT }, NUMBER), record({}, NUMBER))).toBe(false);
    expect(isAssignable(record({ a: TEXT }, NUMBER), record({ a: NUMBER }, TEXT))).toBe(false);
    expect(isAssignable(record({ a: TEXT }, TEXT), record({ a: TEXT }, TEXT))).toBe(true);
  });
});

describe('secret', () => {
  it('is assignable only to secret ports', () => {
    for (const to of [...UNIVERSE, list(SECRET), optional(TEXT)]) {
      const isSecretLike = to.t === 'ref' && to.of === 'secret';
      const wrapsSecret = to.t === 'optional' && to.of.t === 'ref' && to.of.of === 'secret';
      expect(isAssignable(SECRET, to)).toBe(isSecretLike || wrapsSecret);
    }
    expect(isAssignable(SECRET, optional(SECRET))).toBe(true);
    expect(isAssignable(optional(SECRET), SECRET)).toBe(false);
  });

  it('accepts nothing but a secret', () => {
    for (const from of UNIVERSE) {
      expect(isAssignable(from, SECRET)).toBe(from.t === 'ref' && from.of === 'secret');
    }
    expect(isAssignable(TEXT, SECRET)).toBe(false);
    expect(isAssignable(ANY, SECRET)).toBe(false);
  });

  it('never reaches text or any, even in a template', () => {
    expect(isAssignable(SECRET, TEXT)).toBe(false);
    expect(isAssignable(SECRET, TEXT, 'template')).toBe(false);
    expect(isAssignable(SECRET, ANY)).toBe(false);
    expect(isAssignable(SECRET, optional(ANY))).toBe(false);
    expect(isAssignable(list(SECRET), list(ANY))).toBe(false);
    expect(isAssignable(list(SECRET), ANY)).toBe(false);
    expect(isAssignable(optional(list(SECRET)), optional(ANY))).toBe(false);
    expect(isAssignable(record({ key: SECRET }), ANY)).toBe(false);
    expect(isAssignable(openRecord(SECRET), ANY)).toBe(false);
    expect(isAssignable(record({ key: list(TEXT) }), ANY)).toBe(true);
    expect(holdsSecret(record({ key: TEXT }))).toBe(false);
    expect(holdsSecret(record({}, optional(SECRET)))).toBe(true);
  });

  it('has no conversions in either direction', () => {
    for (const other of UNIVERSE) {
      expect(conversionsOffered(SECRET, other)).toEqual([]);
      expect(conversionsOffered(other, SECRET)).toEqual([]);
    }
    expect(conversionsOffered(ANY, SECRET)).toEqual([]);
    expect(conversionsOffered(optional(SECRET), SECRET)).toEqual([]);
  });
});

describe('explicit conversions', () => {
  it('lists exactly the five conversions of the language', () => {
    expect(EXPLICIT_CONVERSIONS.map((row) => row.id)).toEqual([
      'textToNumber',
      'numberToDuration',
      'unwrapOptional',
      'narrowAny',
      'choiceToLabel',
    ]);
  });

  it('offers a conversion on a mismatched port', () => {
    expect(conversionsOffered(TEXT, NUMBER)).toEqual(['textToNumber']);
    expect(conversionsOffered(NUMBER, DURATION)).toEqual(['numberToDuration']);
    expect(conversionsOffered(optional(TEXT), TEXT)).toEqual(['unwrapOptional']);
    expect(conversionsOffered(optional(INTEGER), NUMBER)).toEqual(['unwrapOptional']);
    expect(conversionsOffered(ANY, NUMBER)).toEqual(['narrowAny']);
    expect(conversionsOffered(ANY, list(TEXT))).toEqual(['narrowAny']);
    expect(conversionsOffered(CHOICE_AB, TEXT)).toEqual(['choiceToLabel']);
  });

  it('offers nothing when the types already fit', () => {
    expect(conversionsOffered(TEXT, TEXT)).toEqual([]);
    expect(conversionsOffered(INTEGER, NUMBER)).toEqual([]);
    expect(conversionsOffered(ANY, ANY)).toEqual([]);
    expect(conversionsOffered(ANY, optional(TEXT))).toEqual([]);
  });

  it('offers nothing for pairs that need a different kind of fix', () => {
    expect(conversionsOffered(NUMBER, BOOLEAN)).toEqual([]);
    expect(conversionsOffered(BOOLEAN, NUMBER)).toEqual([]);
    expect(conversionsOffered(optional(TEXT), NUMBER)).toEqual([]);
    expect(conversionsOffered(DURATION, NUMBER)).toEqual([]);
    expect(conversionsOffered(NUMBER, TEXT)).toEqual([]);
    expect(conversionsOffered(TEXT, CHOICE_AB)).toEqual([]);
  });

  it('offers a conversion only for pairs that do not fit', () => {
    fc.assert(
      fc.property(typeArbitrary, typeArbitrary, (from, to) => {
        if (isAssignable(from, to)) expect(conversionsOffered(from, to)).toEqual([]);
      }),
    );
  });
});

describe('assignability laws', () => {
  it('is reflexive for every generated type', () => {
    fc.assert(fc.property(typeArbitrary, (type) => isAssignable(type, type)));
  });

  it('is reflexive and transitive over the whole universe', () => {
    const fits = UNIVERSE.map((from) => UNIVERSE.map((to) => isAssignable(from, to)));
    for (const [index, row] of fits.entries()) {
      expect(row[index]).toBe(true);
      for (const [middle, firstStep] of row.entries()) {
        if (!firstStep) continue;
        for (const [last, secondStep] of (fits[middle] ?? []).entries()) {
          if (secondStep) expect(row[last]).toBe(true);
        }
      }
    }
  });

  it('is transitive along chains of widenings', () => {
    fc.assert(
      fc.property(typeArbitrary, fc.nat(), fc.nat(), (type, first, second) => {
        const middle = widen(type, first);
        const last = widen(middle, second);
        expect(isAssignable(type, middle)).toBe(true);
        expect(isAssignable(middle, last)).toBe(true);
        expect(isAssignable(type, last)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('is transitive whenever two generated types are chained', () => {
    fc.assert(
      fc.property(typeArbitrary, typeArbitrary, typeArbitrary, (a, b, c) => {
        fc.pre(isAssignable(a, b) && isAssignable(b, c));
        expect(isAssignable(a, c)).toBe(true);
      }),
      { numRuns: 300, maxSkipsPerRun: 100000 },
    );
  });

  it('accepts every generated type as a value of optional of itself', () => {
    fc.assert(
      fc.property(typeArbitrary, (type) => {
        fc.pre(type.t !== 'optional');
        expect(isAssignable(type, optional(type))).toBe(true);
      }),
    );
  });

  it('only generates types the schema accepts', () => {
    fc.assert(fc.property(typeArbitrary, (type) => FLOW_TYPE.safeParse(type).success));
  });
});

describe('generic resolution', () => {
  const T = param('T');

  it('binds a parameter from the first connected value', () => {
    const result = resolveGenerics(list(T), list(INTEGER));
    expect(result).toEqual({ ok: true, bindings: new Map([['T', INTEGER]]) });
  });

  it('keeps the first binding and accepts later values that fit it', () => {
    const first = resolveGenerics(T, NUMBER);
    if (!first.ok) throw new Error('expected a binding');
    expect(resolveGenerics(T, INTEGER, first.bindings)).toEqual({
      ok: true,
      bindings: first.bindings,
    });
    expect(resolveGenerics(T, TEXT, first.bindings)).toEqual({
      ok: false,
      expected: NUMBER,
      received: TEXT,
    });
  });

  it('looks through optionals on either side', () => {
    expect(resolveGenerics(optional(T), optional(TEXT))).toEqual({
      ok: true,
      bindings: new Map([['T', TEXT]]),
    });
    expect(resolveGenerics(optional(T), TEXT)).toEqual({
      ok: true,
      bindings: new Map([['T', TEXT]]),
    });
  });

  it('resolves record fields and open values together', () => {
    const declared = record({ level: T }, param('U'));
    const actual = record({ level: INTEGER }, TEXT);
    expect(resolveGenerics(declared, actual)).toEqual({
      ok: true,
      bindings: new Map<string, FlowType>([
        ['T', INTEGER],
        ['U', TEXT],
      ]),
    });
  });

  it('reports a record that lacks a field or open values', () => {
    expect(resolveGenerics(record({ level: T }), record({}))).toEqual({
      ok: false,
      expected: T,
      received: record({}),
    });
    expect(resolveGenerics(record({}, T), record({}))).toEqual({
      ok: false,
      expected: record({}, T),
      received: record({}),
    });
    expect(resolveGenerics(record({ a: T, b: T }), record({ a: TEXT, b: NUMBER }))).toEqual({
      ok: false,
      expected: TEXT,
      received: NUMBER,
    });
    expect(resolveGenerics(record({ a: T, b: T }), record({ a: TEXT }))).toEqual({
      ok: false,
      expected: T,
      received: record({ a: TEXT }),
    });
    expect(resolveGenerics(record({ a: NUMBER, b: T }), record({ a: TEXT, b: TEXT }))).toEqual({
      ok: false,
      expected: NUMBER,
      received: TEXT,
    });
  });

  it('resolves an open record against an open record', () => {
    expect(resolveGenerics(openRecord(T), openRecord(TEXT))).toEqual({
      ok: true,
      bindings: new Map([['T', TEXT]]),
    });
  });

  it('reports an open record that has no named fields', () => {
    expect(resolveGenerics(record({ level: T }), openRecord(TEXT))).toEqual({
      ok: false,
      expected: T,
      received: openRecord(TEXT),
    });
  });

  it('checks parameter free types with assignability', () => {
    expect(resolveGenerics(NUMBER, INTEGER)).toEqual({ ok: true, bindings: new Map() });
    expect(resolveGenerics(NUMBER, TEXT)).toEqual({ ok: false, expected: NUMBER, received: TEXT });
    expect(resolveGenerics(list(T), TEXT)).toEqual({
      ok: false,
      expected: list(T),
      received: TEXT,
    });
  });

  it('substitutes bound parameters and leaves unbound ones', () => {
    const bindings = new Map<string, FlowType>([['T', INTEGER]]);
    expect(substituteGenerics(list(T), bindings)).toEqual(list(INTEGER));
    expect(substituteGenerics(optional(T), bindings)).toEqual(optional(INTEGER));
    expect(substituteGenerics(record({ a: T }, param('U')), bindings)).toEqual(
      record({ a: INTEGER }, param('U')),
    );
    expect(substituteGenerics(record({ a: T }), bindings)).toEqual(record({ a: INTEGER }));
    expect(substituteGenerics(openRecord(T), bindings)).toEqual(openRecord(INTEGER));
    expect(substituteGenerics(param('U'), bindings)).toEqual(param('U'));
    expect(substituteGenerics(TEXT, bindings)).toEqual(TEXT);
  });

  it('knows when a type still has parameters', () => {
    expect(hasUnresolvedGenerics(T)).toBe(true);
    expect(hasUnresolvedGenerics(list(optional(T)))).toBe(true);
    expect(hasUnresolvedGenerics(record({ a: T }))).toBe(true);
    expect(hasUnresolvedGenerics(openRecord(T))).toBe(true);
    expect(hasUnresolvedGenerics(record({ a: TEXT }, NUMBER))).toBe(false);
    expect(hasUnresolvedGenerics(record({}))).toBe(false);
    expect(hasUnresolvedGenerics(TEXT)).toBe(false);
  });

  it('resolves to a type that accepts the connected value', () => {
    fc.assert(
      fc.property(typeArbitrary, (actual) => {
        fc.pre(!hasUnresolvedGenerics(actual));
        const result = resolveGenerics(list(T), list(actual));
        if (!result.ok) throw new Error('expected a binding');
        const resolved = substituteGenerics(list(T), result.bindings);
        expect(isAssignable(list(actual), resolved)).toBe(true);
        expect(hasUnresolvedGenerics(resolved)).toBe(false);
      }),
    );
  });
});

describe('display names', () => {
  it('names scalars in plain words', () => {
    expect(typeDisplayName(BOOLEAN)).toBe('On/off');
    expect(typeDisplayName(TEXT)).toBe('Text');
    expect(typeDisplayName(DURATION)).toBe('Duration');
    expect(typeDisplayName(INSTANT)).toBe('Date and time');
    expect(typeDisplayName(TIME)).toBe('Time of day');
    expect(typeDisplayName(DATE)).toBe('Date');
    expect(typeDisplayName(COLOR)).toBe('Color');
    expect(typeDisplayName(ERROR)).toBe('Error');
    expect(typeDisplayName(ANY)).toBe('Any value');
  });

  it('names number refinements', () => {
    expect(typeDisplayName(NUMBER)).toBe('Number');
    expect(typeDisplayName(INTEGER)).toBe('Whole number');
    expect(typeDisplayName({ t: 'number', min: 0, max: 100, unit: 'percent' })).toBe(
      'Number from 0 to 100 in percent',
    );
    expect(typeDisplayName({ t: 'number', min: 1 })).toBe('Number of at least 1');
    expect(typeDisplayName({ t: 'number', max: 9 })).toBe('Number of at most 9');
  });

  it('names containers and references', () => {
    expect(typeDisplayName(list(INTEGER))).toBe('List of whole number');
    expect(typeDisplayName(optional(list(TEXT)))).toBe('Optional list of text');
    expect(typeDisplayName(CHOICE_AB)).toBe('Choice of Alpha, Beta');
    expect(typeDisplayName(openRecord(TEXT))).toBe('Record with other fields: text');
    expect(typeDisplayName(record({}))).toBe('Record');
    expect(typeDisplayName(record({ level: NUMBER }, TEXT))).toBe(
      'Record with level: number, other fields: text',
    );
    expect(typeDisplayName(DEVICE)).toBe('Device');
    expect(typeDisplayName(LIGHT)).toBe('Device that can power, brightness');
    expect(typeDisplayName({ t: 'ref', of: 'target' })).toBe('Target');
    expect(typeDisplayName(SECRET)).toBe('Secret');
    expect(typeDisplayName(param('T'))).toBe('T');
  });
});
