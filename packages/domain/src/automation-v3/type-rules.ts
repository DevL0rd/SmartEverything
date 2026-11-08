import type { FlowType } from './types';

export { typeDisplayName, type EntityTitleOf } from './type-names';

type Comparer = (from: FlowType, to: FlowType) => boolean;

export type AssignContext = 'port' | 'template';

export type ImplicitCoercionId =
  | 'integerToNumber'
  | 'valueToOptional'
  | 'deviceNarrowing'
  | 'devicesToTarget'
  | 'listToListOfAny'
  | 'renderToText'
  | 'entityToText'
  | 'textToEntity';

export type ExplicitConversionId =
  'textToNumber' | 'numberToDuration' | 'unwrapOptional' | 'narrowAny' | 'choiceToLabel';

export const IMPLICIT_COERCIONS = [
  { id: 'integerToNumber', from: 'whole number', to: 'number', where: 'everywhere' },
  { id: 'valueToOptional', from: 'T', to: 'optional T', where: 'everywhere' },
  { id: 'deviceNarrowing', from: 'device with capabilities', to: 'device', where: 'everywhere' },
  { id: 'devicesToTarget', from: 'device or list of devices', to: 'target', where: 'everywhere' },
  { id: 'listToListOfAny', from: 'list of T', to: 'list of any', where: 'everywhere' },
  {
    id: 'renderToText',
    from: 'scalar, instant, duration or reference',
    to: 'text',
    where: 'template',
  },
  { id: 'entityToText', from: 'plugin entity', to: 'text', where: 'everywhere' },
  { id: 'textToEntity', from: 'text', to: 'plugin entity', where: 'everywhere' },
] as const satisfies readonly {
  readonly id: ImplicitCoercionId;
  readonly from: string;
  readonly to: string;
  readonly where: 'everywhere' | 'template';
}[];

export const EXPLICIT_CONVERSIONS = [
  {
    id: 'textToNumber',
    label: 'Wire it through a Convert node set to Number',
    from: 'text',
    to: 'number',
  },
  {
    id: 'numberToDuration',
    label: 'Wire it through a Convert node set to Duration',
    from: 'number',
    to: 'duration',
  },
  {
    id: 'unwrapOptional',
    label: 'Wire it through a First available node with a default, or test it with Has a value',
    from: 'optional T',
    to: 'T',
  },
  { id: 'narrowAny', label: 'Wire it through a Convert node', from: 'any', to: 'T' },
  { id: 'choiceToLabel', label: 'Use the label of the choice', from: 'choice', to: 'text' },
] as const satisfies readonly {
  readonly id: ExplicitConversionId;
  readonly label: string;
  readonly from: string;
  readonly to: string;
}[];

const RENDERABLE_TAGS: ReadonlySet<FlowType['t']> = new Set([
  'boolean',
  'number',
  'text',
  'duration',
  'instant',
  'timeOfDay',
  'date',
  'choice',
  'ref',
  'entity',
]);

function isSecret(type: FlowType): boolean {
  return type.t === 'ref' && type.of === 'secret';
}

export function holdsSecret(type: FlowType): boolean {
  if (isSecret(type)) return true;
  if (type.t === 'list' || type.t === 'optional') return holdsSecret(type.of);
  if (type.t !== 'record') return false;
  return (
    Object.values(type.fields ?? {}).some(holdsSecret) ||
    (type.values !== undefined && holdsSecret(type.values))
  );
}

export function isTemplateRenderable(type: FlowType): boolean {
  return RENDERABLE_TAGS.has(type.t) && !isSecret(type);
}

function sameTag(from: FlowType, to: FlowType): boolean {
  return from.t === to.t;
}

type NumberType = Extract<FlowType, { readonly t: 'number' }>;

function withinBounds(from: NumberType, to: NumberType): boolean {
  const lowerHolds = to.min === undefined || (from.min !== undefined && from.min >= to.min);
  const upperHolds = to.max === undefined || (from.max !== undefined && from.max <= to.max);
  return lowerHolds && upperHolds;
}

function numberComparer(from: FlowType, to: FlowType): boolean {
  if (from.t !== 'number' || to.t !== 'number') return false;
  if (to.integer === true && from.integer !== true) return false;
  return withinBounds(from, to) && (to.unit === undefined || from.unit === to.unit);
}

function listComparer(from: FlowType, to: FlowType): boolean {
  return from.t === 'list' && to.t === 'list' && isAssignable(from.of, to.of);
}

function choiceComparer(from: FlowType, to: FlowType): boolean {
  if (from.t !== 'choice' || to.t !== 'choice') return false;
  const allowed = new Set(to.options.map((option) => option.id));
  return from.options.every((option) => allowed.has(option.id));
}

function isDevice(type: FlowType): boolean {
  return type.t === 'ref' && type.of === 'device';
}

function isTarget(type: FlowType): boolean {
  return type.t === 'ref' && type.of === 'target';
}

function fillsTarget(from: FlowType, to: FlowType): boolean {
  return isTarget(to) && (isDevice(from) || (from.t === 'list' && isDevice(from.of)));
}

type RefType = Extract<FlowType, { readonly t: 'ref' }>;

function familiesHold(from: RefType, to: RefType): boolean {
  if (to.families === undefined) return true;
  const allowed = new Set(to.families);
  return from.families?.every((family) => allowed.has(family)) === true;
}

function refComparer(from: FlowType, to: FlowType): boolean {
  if (from.t !== 'ref' || to.t !== 'ref' || from.of !== to.of) return false;
  const held = new Set(from.capabilities ?? []);
  return (
    (to.capabilities ?? []).every((capability) => held.has(capability)) && familiesHold(from, to)
  );
}

function textComparer(from: FlowType, to: FlowType): boolean {
  return from.t === 'text' && (to.t === 'text' || to.t === 'entity');
}

function entityComparer(from: FlowType, to: FlowType): boolean {
  if (from.t !== 'entity') return false;
  return to.t === 'text' || (to.t === 'entity' && to.of === from.of);
}

function paramComparer(from: FlowType, to: FlowType): boolean {
  return from.t === 'param' && to.t === 'param' && from.name === to.name;
}

function recordFieldsHold(
  fromFields: Readonly<Record<string, FlowType>>,
  toFields: Readonly<Record<string, FlowType>>,
): boolean {
  return Object.entries(toFields).every(([name, expected]) => {
    const held = fromFields[name];
    return held !== undefined && isAssignable(held, expected);
  });
}

function recordValuesHold(
  from: Extract<FlowType, { readonly t: 'record' }>,
  to: Extract<FlowType, { readonly t: 'record' }>,
): boolean {
  if (to.values === undefined) return true;
  if (from.values === undefined || !isAssignable(from.values, to.values)) return false;
  const named = new Set(Object.keys(to.fields ?? {}));
  const expected = to.values;
  return Object.entries(from.fields ?? {}).every(
    ([name, held]) => named.has(name) || isAssignable(held, expected),
  );
}

function dropsSecret(
  from: Extract<FlowType, { readonly t: 'record' }>,
  to: Extract<FlowType, { readonly t: 'record' }>,
): boolean {
  if (to.values !== undefined) return false;
  const named = new Set(Object.keys(to.fields ?? {}));
  const unnamed = Object.entries(from.fields ?? {}).filter(([name]) => !named.has(name));
  return (
    unnamed.some(([, held]) => holdsSecret(held)) ||
    (from.values !== undefined && holdsSecret(from.values))
  );
}

function recordComparer(from: FlowType, to: FlowType): boolean {
  if (from.t !== 'record' || to.t !== 'record' || dropsSecret(from, to)) return false;
  return recordFieldsHold(from.fields ?? {}, to.fields ?? {}) && recordValuesHold(from, to);
}

const COMPARERS: Readonly<Record<FlowType['t'], Comparer>> = {
  boolean: sameTag,
  number: numberComparer,
  text: textComparer,
  duration: sameTag,
  instant: sameTag,
  timeOfDay: sameTag,
  date: sameTag,
  list: listComparer,
  record: recordComparer,
  choice: choiceComparer,
  ref: refComparer,
  color: sameTag,
  error: sameTag,
  optional: sameTag,
  any: sameTag,
  param: paramComparer,
  entity: entityComparer,
};

function structurallyAssignable(from: FlowType, to: FlowType, context: AssignContext): boolean {
  if (isSecret(from) || isSecret(to)) return isSecret(from) && isSecret(to);
  if (to.t === 'any') return !holdsSecret(from);
  if (context === 'template' && to.t === 'text' && isTemplateRenderable(from)) return true;
  if (fillsTarget(from, to)) return true;
  return COMPARERS[from.t](from, to);
}

export function isAssignable(
  from: FlowType,
  to: FlowType,
  context: AssignContext = 'port',
): boolean {
  if (to.t === 'optional') {
    return isAssignable(from.t === 'optional' ? from.of : from, to.of, context);
  }
  return from.t !== 'optional' && structurallyAssignable(from, to, context);
}

function narrowsDevice(from: FlowType, to: FlowType): boolean {
  return (
    from.t === 'ref' &&
    to.t === 'ref' &&
    from.of === 'device' &&
    (from.capabilities ?? []).length > (to.capabilities ?? []).length
  );
}

function refinesNumber(from: FlowType, to: FlowType): boolean {
  return from.t === 'number' && to.t === 'number' && from.integer === true && to.integer !== true;
}

function widensList(from: FlowType, to: FlowType): boolean {
  return from.t === 'list' && to.t === 'list' && to.of.t === 'any' && from.of.t !== 'any';
}

function shapeCoercionOf(from: FlowType, to: FlowType): ImplicitCoercionId | null {
  if (from.t === 'entity' && to.t === 'text') return 'entityToText';
  if (from.t === 'text' && to.t === 'entity') return 'textToEntity';
  return widensList(from, to) ? 'listToListOfAny' : null;
}

export function implicitCoercionOf(
  from: FlowType,
  to: FlowType,
  context: AssignContext = 'port',
): ImplicitCoercionId | null {
  if (!isAssignable(from, to, context)) return null;
  if (to.t === 'optional' && from.t !== 'optional') return 'valueToOptional';
  if (!isAssignable(from, to)) return 'renderToText';
  if (refinesNumber(from, to)) return 'integerToNumber';
  if (narrowsDevice(from, to)) return 'deviceNarrowing';
  if (fillsTarget(from, to)) return 'devicesToTarget';
  return shapeCoercionOf(from, to);
}

const CONVERSION_RULES: readonly {
  readonly id: ExplicitConversionId;
  readonly applies: (from: FlowType, to: FlowType) => boolean;
}[] = [
  { id: 'textToNumber', applies: (from, to) => from.t === 'text' && to.t === 'number' },
  { id: 'numberToDuration', applies: (from, to) => from.t === 'number' && to.t === 'duration' },
  {
    id: 'unwrapOptional',
    applies: (from, to) => from.t === 'optional' && isAssignable(from.of, to),
  },
  { id: 'narrowAny', applies: (from, to) => from.t === 'any' && to.t !== 'optional' },
  { id: 'choiceToLabel', applies: (from, to) => from.t === 'choice' && to.t === 'text' },
];

export const TEXT_TO_ENTITY_ADVICE =
  'This text is used as a plugin entity id. Pick the entity, or make sure the wired text is an id the plugin knows.';

function unwrapped(type: FlowType): FlowType {
  return type.t === 'optional' ? unwrapped(type.of) : type;
}

export function assignmentAdvice(from: FlowType, to: FlowType): string | null {
  const coercion = implicitCoercionOf(unwrapped(from), unwrapped(to));
  return coercion === 'textToEntity' && isAssignable(from, to) ? TEXT_TO_ENTITY_ADVICE : null;
}

export function conversionsOffered(from: FlowType, to: FlowType): readonly ExplicitConversionId[] {
  if (isSecret(from) || isSecret(to) || isAssignable(from, to)) return [];
  return CONVERSION_RULES.filter((rule) => rule.applies(from, to)).map((rule) => rule.id);
}

export type GenericBindings = ReadonlyMap<string, FlowType>;

export type GenericResolution =
  | { readonly ok: true; readonly bindings: GenericBindings }
  | { readonly ok: false; readonly expected: FlowType; readonly received: FlowType };

function mismatch(expected: FlowType, received: FlowType): GenericResolution {
  return { ok: false, expected, received };
}

function resolveParam(
  name: string,
  actual: FlowType,
  bindings: GenericBindings,
): GenericResolution {
  const bound = bindings.get(name);
  if (bound === undefined) return { ok: true, bindings: new Map([...bindings, [name, actual]]) };
  return isAssignable(actual, bound) ? { ok: true, bindings } : mismatch(bound, actual);
}

function resolveRecord(
  declared: Extract<FlowType, { readonly t: 'record' }>,
  actual: Extract<FlowType, { readonly t: 'record' }>,
  bindings: GenericBindings,
): GenericResolution {
  let state: GenericResolution = { ok: true, bindings };
  for (const [name, expected] of Object.entries(declared.fields ?? {})) {
    const held = actual.fields?.[name];
    if (!state.ok) return state;
    state =
      held === undefined
        ? mismatch(expected, actual)
        : resolveGenerics(expected, held, state.bindings);
  }
  if (!state.ok || declared.values === undefined) return state;
  return actual.values === undefined
    ? mismatch(declared, actual)
    : resolveGenerics(declared.values, actual.values, state.bindings);
}

export function resolveGenerics(
  declared: FlowType,
  actual: FlowType,
  bindings: GenericBindings = new Map(),
): GenericResolution {
  if (declared.t === 'param') return resolveParam(declared.name, actual, bindings);
  if (declared.t === 'optional') {
    return resolveGenerics(declared.of, actual.t === 'optional' ? actual.of : actual, bindings);
  }
  if (declared.t === 'list' && actual.t === 'list') {
    return resolveGenerics(declared.of, actual.of, bindings);
  }
  if (declared.t === 'record' && actual.t === 'record') {
    return resolveRecord(declared, actual, bindings);
  }
  return isAssignable(actual, declared) ? { ok: true, bindings } : mismatch(declared, actual);
}

function substituteRecord(
  type: Extract<FlowType, { readonly t: 'record' }>,
  bindings: GenericBindings,
): FlowType {
  return {
    t: 'record',
    ...(type.fields === undefined
      ? {}
      : {
          fields: Object.fromEntries(
            Object.entries(type.fields).map(([name, field]) => [
              name,
              substituteGenerics(field, bindings),
            ]),
          ),
        }),
    ...(type.values === undefined ? {} : { values: substituteGenerics(type.values, bindings) }),
  };
}

export function substituteGenerics(type: FlowType, bindings: GenericBindings): FlowType {
  if (type.t === 'param') return bindings.get(type.name) ?? type;
  if (type.t === 'list') return { t: 'list', of: substituteGenerics(type.of, bindings) };
  if (type.t === 'optional') return { t: 'optional', of: substituteGenerics(type.of, bindings) };
  return type.t === 'record' ? substituteRecord(type, bindings) : type;
}

export function hasUnresolvedGenerics(type: FlowType): boolean {
  if (type.t === 'param') return true;
  if (type.t === 'list' || type.t === 'optional') return hasUnresolvedGenerics(type.of);
  if (type.t !== 'record') return false;
  return (
    Object.values(type.fields ?? {}).some(hasUnresolvedGenerics) ||
    (type.values !== undefined && hasUnresolvedGenerics(type.values))
  );
}
