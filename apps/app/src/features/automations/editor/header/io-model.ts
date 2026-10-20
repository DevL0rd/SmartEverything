import type { InputPort, JsonValue, OutputPort } from '@smarteverything/domain';
import type { HeaderOp } from '@smarteverything/flow/ops/schema';
import { freshName, nameProblem, optionOf, typeValueOf } from './type-choices';

function inputsOp(inputs: readonly InputPort[]): HeaderOp {
  return { op: 'header', inputs: [...inputs] };
}

function outputsOp(outputs: readonly OutputPort[]): HeaderOp {
  return { op: 'header', outputs: [...outputs] };
}

export function addInput(inputs: readonly InputPort[]): HeaderOp {
  const created: InputPort = {
    name: freshName(
      'input',
      inputs.map((input) => input.name),
    ),
    type: optionOf('text').type,
    required: false,
  };
  return inputsOp([...inputs, created]);
}

export function removeInput(inputs: readonly InputPort[], name: string): HeaderOp {
  return inputsOp(inputs.filter((input) => input.name !== name));
}

function inputChanged(
  inputs: readonly InputPort[],
  name: string,
  change: (input: InputPort) => InputPort,
): HeaderOp {
  return inputsOp(inputs.map((input) => (input.name === name ? change(input) : input)));
}

export function renameInput(inputs: readonly InputPort[], from: string, to: string): HeaderOp {
  return inputChanged(inputs, from, (input) => ({ ...input, name: to }));
}

export function relabelInput(inputs: readonly InputPort[], name: string, label: string): HeaderOp {
  return inputChanged(inputs, name, (input) => {
    const { label: _dropped, ...rest } = input;
    return label.trim() === '' ? rest : { ...rest, label: label.trim() };
  });
}

export function retypeInput(
  inputs: readonly InputPort[],
  name: string,
  typeValue: string,
): HeaderOp {
  return inputChanged(inputs, name, (input) => {
    const { default: _dropped, ...rest } = input;
    return { ...rest, type: optionOf(typeValue).type };
  });
}

export function requireInput(
  inputs: readonly InputPort[],
  name: string,
  required: boolean,
): HeaderOp {
  return inputChanged(inputs, name, (input) => {
    const { default: _dropped, ...rest } = input;
    return { ...rest, required };
  });
}

export function defaultInput(
  inputs: readonly InputPort[],
  name: string,
  value: JsonValue | undefined,
): HeaderOp {
  return inputChanged(inputs, name, (input) => {
    const { default: _dropped, ...rest } = input;
    return value === undefined ? rest : { ...rest, default: value };
  });
}

export function addOutput(outputs: readonly OutputPort[]): HeaderOp {
  const created: OutputPort = {
    name: freshName(
      'result',
      outputs.map((output) => output.name),
    ),
    type: optionOf('text').type,
  };
  return outputsOp([...outputs, created]);
}

export function removeOutput(outputs: readonly OutputPort[], name: string): HeaderOp {
  return outputsOp(outputs.filter((output) => output.name !== name));
}

function outputChanged(
  outputs: readonly OutputPort[],
  name: string,
  change: (output: OutputPort) => OutputPort,
): HeaderOp {
  return outputsOp(outputs.map((output) => (output.name === name ? change(output) : output)));
}

export function renameOutput(outputs: readonly OutputPort[], from: string, to: string): HeaderOp {
  return outputChanged(outputs, from, (output) => ({ ...output, name: to }));
}

export function retypeOutput(
  outputs: readonly OutputPort[],
  name: string,
  typeValue: string,
): HeaderOp {
  return outputChanged(outputs, name, (output) => ({ ...output, type: optionOf(typeValue).type }));
}

export function optionalOutput(
  outputs: readonly OutputPort[],
  name: string,
  optional: boolean,
): HeaderOp {
  return outputChanged(outputs, name, (output) => {
    const { optional: _dropped, ...rest } = output;
    return optional ? { ...rest, optional: true } : rest;
  });
}

export function portProblem(
  ports: readonly { readonly name: string }[],
  from: string,
  name: string,
): string | undefined {
  if (name === from) return undefined;
  return nameProblem(
    ports.map((port) => port.name),
    name,
  );
}

export function inputLine(input: InputPort): string {
  const kind = optionOf(typeValueOf(input.type)).label;
  return input.required ? `${kind}, required` : `${kind}, optional`;
}

export function outputLine(output: OutputPort): string {
  const kind = optionOf(typeValueOf(output.type)).label;
  return output.optional === true ? `${kind}, optional` : kind;
}
