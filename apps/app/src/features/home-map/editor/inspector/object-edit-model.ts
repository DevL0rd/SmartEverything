import {
  modelOuterSize,
  type HomeMapEditPreset,
  type HomeMapObject,
  type HomeMapParams,
  type HomeMapSizeAxis,
  type ModelSpec,
  type ModelSpecParam,
} from '@smarteverything/domain';
import {
  homeMapEditInner,
  homeMapEditLimits,
  homeMapObjectBox,
  type HomeMapEditAxisLimit,
} from '@smarteverything/domain/home-map-edit-core';
import { FINISH_TOKENS, isFinishToken } from '../../../../components/models/three/materials';
import { categoryLabel } from '../../../../format/text';
import { editFactsOf, editObjectOf } from '../../../../components/house-map/edit/furniture-box';
import { quarterTurn } from '../manipulate/object-actions';
import type { GizmoMode } from '../tool-state';

export type ObjectEditUnit = ModelSpecParam['unit'];

export interface ObjectEditParam {
  readonly name: string;
  readonly label: string;
  readonly unit: ObjectEditUnit;
  readonly min: number;
  readonly max: number;
  readonly fallback: number;
  readonly axis: HomeMapSizeAxis | null;
}

export interface ObjectEditChoice {
  readonly name: string;
  readonly label: string;
}

export interface ObjectEditFinish extends ObjectEditChoice {
  readonly colour: string | null;
}

export interface ObjectEditFacts {
  readonly title: string;
  readonly size: readonly ObjectEditParam[];
  readonly parts: readonly ObjectEditParam[];
  readonly presets: readonly HomeMapEditPreset[];
  readonly styles: readonly ObjectEditChoice[];
  readonly defaultStyle: string | null;
  readonly finishes: readonly ObjectEditFinish[];
  readonly defaultFinish: string | null;
  readonly derive?: (params: HomeMapParams) => HomeMapParams;
}

export const CUSTOM_PRESET = 'custom';
export const CUSTOM_HINT = 'Drag the handles';
const MATCH_M = 0.005;

export const STEP: Readonly<Record<ObjectEditUnit, number>> = { m: 1, deg: 1, count: 1, ratio: 1 };
export const SHOWN_UNIT: Readonly<Record<ObjectEditUnit, string>> = {
  m: 'cm',
  deg: '°',
  count: '',
  ratio: '%',
};
export const SCALE: Readonly<Record<ObjectEditUnit, number>> = {
  m: 100,
  deg: 1,
  count: 1,
  ratio: 100,
};

function finishColour(overrides: NonNullable<ModelSpec['finishes']>[string]): string | null {
  for (const override of Object.values(overrides)) {
    if (override.color !== undefined) return override.color;
    if (override.finish !== undefined && isFinishToken(override.finish))
      return FINISH_TOKENS[override.finish].color;
  }
  return null;
}

export function objectEditFacts(spec: ModelSpec): ObjectEditFacts {
  const edit = editFactsOf(spec);
  const axes = new Map((edit?.sizeParams ?? []).map((param) => [param.name, param.axis]));
  const params = Object.entries(spec.params ?? {}).map(([name, param]): ObjectEditParam => ({
    name,
    label: categoryLabel(name),
    unit: param.unit,
    min: param.min,
    max: param.max,
    fallback: param.default,
    axis: axes.get(name) ?? null,
  }));
  return {
    title: spec.title,
    size: params.filter((param) => param.axis !== null),
    parts: params.filter((param) => param.axis === null),
    presets: edit?.presets ?? [],
    styles: [],
    defaultStyle: null,
    finishes: Object.entries(spec.finishes ?? {}).map(([name, overrides]) => ({
      name,
      label: categoryLabel(name),
      colour: finishColour(overrides),
    })),
    defaultFinish: spec.defaultFinish ?? null,
    ...(edit?.derive === undefined ? {} : { derive: edit.derive }),
  };
}

export function paramValue(object: HomeMapObject, param: ObjectEditParam): number {
  return object.params[param.name] ?? param.fallback;
}

function withDerived(facts: ObjectEditFacts, params: HomeMapParams): HomeMapParams {
  return facts.derive === undefined ? params : { ...params, ...facts.derive(params) };
}

export function paramPatch(
  object: HomeMapObject,
  facts: ObjectEditFacts,
  name: string,
  value: number,
): Partial<HomeMapObject> {
  return { params: withDerived(facts, { ...object.params, [name]: value }) };
}

export function presetPatch(
  object: HomeMapObject,
  facts: ObjectEditFacts,
  preset: HomeMapEditPreset,
): Partial<HomeMapObject> {
  return { params: withDerived(facts, { ...object.params, ...preset.params }) };
}

export function activePreset(object: HomeMapObject, facts: ObjectEditFacts): string {
  const all = [...facts.size, ...facts.parts];
  const current = (name: string): number | undefined => {
    const param = all.find((each) => each.name === name);
    return object.params[name] ?? param?.fallback;
  };
  const hit = facts.presets.find((preset) =>
    Object.entries(preset.params).every(([name, value]) => {
      const now = current(name);
      return now !== undefined && Math.abs(now - value) <= MATCH_M;
    }),
  );
  return hit?.id ?? CUSTOM_PRESET;
}

export function resetPatch(facts: ObjectEditFacts): Partial<HomeMapObject> {
  const params = Object.fromEntries(
    [...facts.size, ...facts.parts].map((param) => [param.name, param.fallback]),
  );
  return {
    params: withDerived(facts, params),
    finish: facts.defaultFinish,
    ...(facts.defaultStyle === null ? {} : { style: facts.defaultStyle }),
  };
}

export function resetLabel(facts: ObjectEditFacts): string {
  return `Reset the ${facts.title.toLowerCase()} to its standard look`;
}

export type FieldId = 'x' | 'y' | 'turn' | 'width' | 'depth' | 'height' | 'above';

export type FieldUnit = 'm' | '°';

export interface TransformField {
  readonly id: FieldId;
  readonly label: string;
  readonly unit: FieldUnit;
  readonly value: number;
  readonly min: number | null;
  readonly max: number | null;
  readonly editable: boolean;
  readonly group: GizmoMode;
  readonly param: HomeMapEditAxisLimit | null;
}

export type FieldCommit =
  | { readonly kind: 'same' }
  | { readonly kind: 'invalid'; readonly reason: string }
  | { readonly kind: 'patch'; readonly patch: Partial<HomeMapObject> };

export const NOT_A_NUMBER = 'Enter a number';

type FieldBase = Omit<TransformField, 'id' | 'label' | 'group' | 'unit'>;

const free = (value: number, editable: boolean): FieldBase => ({
  value,
  min: null,
  max: null,
  editable,
  param: null,
});

const sized = (value: number, limit: HomeMapEditAxisLimit | null): FieldBase => ({
  value,
  min: limit?.min ?? null,
  max: limit?.max ?? null,
  editable: limit !== null,
  param: limit,
});

function field(id: FieldId, label: string, group: GizmoMode, base: FieldBase): TransformField {
  return { id, label, group, unit: id === 'turn' ? '°' : 'm', ...base };
}

export function transformFields(object: HomeMapObject, spec: ModelSpec): readonly TransformField[] {
  const facts = editFactsOf(spec);
  const limits = homeMapEditLimits(facts);
  const box = homeMapObjectBox(editObjectOf(object, spec), facts);
  const height = modelOuterSize(spec, object.params).height;
  const onWall = object.wall !== undefined;
  const above = onWall
    ? [field('above', 'Above floor', 'move', { ...free(object.elevation, true), min: 0 })]
    : [];
  return [
    field('x', 'X', 'move', free(object.at.x, true)),
    field('y', 'Y', 'move', free(object.at.y, true)),
    field('turn', 'Turn', 'rotate', free(object.rotation, !onWall)),
    field('width', 'Width', 'scale', sized(box.w, limits.w)),
    field('depth', 'Depth', 'scale', sized(box.d, limits.d)),
    field('height', 'Height', 'scale', sized(height, limits.h)),
    ...above,
  ];
}

export function fieldText(unit: FieldUnit, value: number): string {
  if (unit === 'm') return value.toFixed(2);
  return String(quarterTurn(Math.round(value * 10) / 10, 0));
}

function parseField(text: string): number | null {
  const cleaned = text
    .trim()
    .replace(',', '.')
    .replace(/\s*(m|°)$/, '');
  const value = cleaned === '' ? Number.NaN : Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function rangeReason(field: TransformField, value: number): string | null {
  if (field.min !== null && value < field.min) return `At least ${fieldText('m', field.min)} m`;
  if (field.max !== null && value > field.max) return `At most ${fieldText('m', field.max)} m`;
  return null;
}

function fieldPatch(
  object: HomeMapObject,
  facts: ObjectEditFacts,
  field: TransformField,
  value: number,
): Partial<HomeMapObject> {
  if (field.param !== null) {
    return paramPatch(object, facts, field.param.name, homeMapEditInner(field.param, value));
  }
  if (field.id === 'x') return { at: { x: value, y: object.at.y } };
  if (field.id === 'y') return { at: { x: object.at.x, y: value } };
  if (field.id === 'turn') return { rotation: quarterTurn(value, 0) };
  return { elevation: value };
}

export function commitField(
  object: HomeMapObject,
  facts: ObjectEditFacts,
  field: TransformField,
  text: string,
): FieldCommit {
  const value = parseField(text);
  if (value === null) return { kind: 'invalid', reason: NOT_A_NUMBER };
  if (fieldText(field.unit, value) === fieldText(field.unit, field.value)) return { kind: 'same' };
  const reason = rangeReason(field, value);
  if (reason !== null) return { kind: 'invalid', reason };
  return { kind: 'patch', patch: fieldPatch(object, facts, field, value) };
}
