import type { PortValue, Variable } from '@smarteverything/domain';
import type { HeaderOp } from '@smarteverything/flow/ops/schema';
import { freshName, initialFor, nameProblem, optionOf, typeValueOf } from './type-choices';

export const KEEP_TITLE = 'Keep between runs';

export const KEEP_EXPLAIN =
  'The value stays after the run ends and the next run starts from it. Every run of this automation shares it. The start value is used only the first time.';

export const RUN_EXPLAIN =
  'Each run starts from the start value. Nothing is kept after the run ends.';

function variablesOp(variables: readonly Variable[]): HeaderOp {
  return { op: 'header', variables: [...variables] };
}

function replaced(
  variables: readonly Variable[],
  name: string,
  change: (variable: Variable) => Variable,
): HeaderOp {
  return variablesOp(
    variables.map((variable) => (variable.name === name ? change(variable) : variable)),
  );
}

export function addVariable(variables: readonly Variable[]): HeaderOp {
  const type = optionOf('number').type;
  const created: Variable = {
    name: freshName(
      'variable',
      variables.map((variable) => variable.name),
    ),
    type,
    initial: initialFor(type),
  };
  return variablesOp([...variables, created]);
}

export function removeVariable(variables: readonly Variable[], name: string): HeaderOp {
  return variablesOp(variables.filter((variable) => variable.name !== name));
}

export function renameVariable(variables: readonly Variable[], from: string, to: string): HeaderOp {
  return replaced(variables, from, (variable) => ({ ...variable, name: to }));
}

export function retypeVariable(
  variables: readonly Variable[],
  name: string,
  typeValue: string,
): HeaderOp {
  const { type } = optionOf(typeValue);
  return replaced(variables, name, (variable) => ({
    ...variable,
    type,
    initial: initialFor(type),
  }));
}

export function setInitial(
  variables: readonly Variable[],
  name: string,
  initial: PortValue,
): HeaderOp {
  return replaced(variables, name, (variable) => ({ ...variable, initial }));
}

export function setKeep(variables: readonly Variable[], name: string, keep: boolean): HeaderOp {
  return replaced(variables, name, (variable) => {
    const { persist: _dropped, ...rest } = variable;
    return keep ? { ...rest, persist: true } : rest;
  });
}

export function variableProblem(
  variables: readonly Variable[],
  from: string,
  name: string,
): string | undefined {
  if (name === from) return undefined;
  return nameProblem(
    variables.map((variable) => variable.name),
    name,
  );
}

export function typeValueOfVariable(variable: Variable): string {
  return typeValueOf(variable.type);
}

export function variableLine(variable: Variable): string {
  const kept = variable.persist === true ? 'kept between runs' : 'new each run';
  return `${optionOf(typeValueOf(variable.type)).label}, ${kept}`;
}
