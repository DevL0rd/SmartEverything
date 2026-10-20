import type { FunctionV3, JsonValue, Variable } from '@smarteverything/domain';
import { literalFits } from '@smarteverything/flow/check/literals';
import {
  freshName,
  initialFor,
  nameProblem,
  optionOf,
  typeValueOf,
} from '../../editor/header/type-choices';
import type { PortLine } from '../detail/detail-model';
import { typeText } from '../make-reusable/plain-reference';

export const KEPT_TITLE = 'Keeps for each use';

export const KEPT_EXPLAIN =
  'Each place this Custom Node is used keeps its own copy between runs. It starts from the start value and survives a restart. Removing the step removes its copy.';

export const KEPT_ACTION_ONLY = 'Only an action Custom Node can keep data between runs.';

export function keptOf(program: FunctionV3): readonly Variable[] {
  return program.variables.filter((variable) => variable.persist === true);
}

function startText(variable: Variable): string {
  const value = 'lit' in variable.initial ? variable.initial.lit : null;
  return value === null ? 'Starts empty' : `Starts at ${JSON.stringify(value)}`;
}

export function keptLines(program: FunctionV3): readonly PortLine[] {
  return keptOf(program).map((variable) => ({
    name: variable.name,
    title: variable.name,
    typeText: typeText(variable.type),
    requirement: startText(variable),
    description: variable.description ?? null,
  }));
}

function withVariables(program: FunctionV3, variables: readonly Variable[]): FunctionV3 {
  return { ...program, variables: [...variables] };
}

function changed(
  program: FunctionV3,
  name: string,
  change: (variable: Variable) => Variable,
): FunctionV3 {
  return withVariables(
    program,
    program.variables.map((variable) => (variable.name === name ? change(variable) : variable)),
  );
}

export function addKept(program: FunctionV3): FunctionV3 {
  const type = optionOf('number').type;
  const name = freshName(
    'data',
    program.variables.map((variable) => variable.name),
  );
  return withVariables(program, [
    ...program.variables,
    { name, type, initial: initialFor(type), persist: true },
  ]);
}

export function removeKept(program: FunctionV3, name: string): FunctionV3 {
  return withVariables(
    program,
    program.variables.filter((variable) => variable.name !== name),
  );
}

export function renameKept(program: FunctionV3, from: string, to: string): FunctionV3 {
  return changed(program, from, (variable) => ({ ...variable, name: to }));
}

export function retypeKept(program: FunctionV3, name: string, typeValue: string): FunctionV3 {
  const { type } = optionOf(typeValue);
  return changed(program, name, (variable) => ({ ...variable, type, initial: initialFor(type) }));
}

export function keptNameProblem(
  program: FunctionV3,
  from: string,
  name: string,
): string | undefined {
  if (name === from) return undefined;
  return nameProblem(
    program.variables.map((variable) => variable.name),
    name,
  );
}

export function keptTypeValue(variable: Variable): string {
  return typeValueOf(variable.type);
}

export function startOf(variable: Variable): string {
  const value = 'lit' in variable.initial ? variable.initial.lit : null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function parsedStart(variable: Variable, text: string): JsonValue | undefined {
  if (variable.type.t === 'text') return text;
  const number = Number(text);
  return text.trim() !== '' && Number.isFinite(number) ? number : undefined;
}

export function editsStart(variable: Variable): boolean {
  return ['text', 'number', 'duration'].includes(variable.type.t);
}

export function startProblem(variable: Variable, text: string): string | undefined {
  const value = parsedStart(variable, text);
  return value !== undefined && literalFits(variable.type, value)
    ? undefined
    : 'Use a value of this kind.';
}

export function setStartValue(program: FunctionV3, name: string, value: JsonValue): FunctionV3 {
  return changed(program, name, (held) => ({ ...held, initial: { lit: value } }));
}

export function setStart(program: FunctionV3, variable: Variable, text: string): FunctionV3 {
  const value = parsedStart(variable, text);
  return value === undefined ? program : setStartValue(program, variable.name, value);
}
