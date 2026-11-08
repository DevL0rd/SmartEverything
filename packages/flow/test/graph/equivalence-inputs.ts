import type { FlowType, InputPort, JsonValue } from '@smarteverything/domain';
import type { Scenario } from './equivalence-harness';

const START = Date.UTC(2026, 9, 24, 9, 0, 0);

const LEAF_SAMPLES: Readonly<Record<string, JsonValue>> = {
  boolean: true,
  number: 1,
  text: 'text',
  ref: 'hall',
};

function sampleOf(type: FlowType): JsonValue {
  if (type.t === 'choice') return type.options[0]?.id ?? '';
  if (type.t === 'list') return [sampleOf(type.of)];
  if (type.t === 'optional') return sampleOf(type.of);
  const sample = LEAF_SAMPLES[type.t];
  if (sample === undefined)
    throw new Error(`the fake world has no sample input for a ${type.t} port`);
  return sample;
}

function valueOf(port: InputPort): JsonValue {
  return port.default ?? sampleOf(port.type);
}

function inputsFor(
  ports: readonly InputPort[],
  chosen: { readonly name: string; readonly option: string } | undefined,
): Readonly<Record<string, JsonValue>> {
  return Object.fromEntries(
    ports
      .filter((port) => port.required || port.default !== undefined)
      .map((port) => [port.name, port.name === chosen?.name ? chosen.option : valueOf(port)]),
  );
}

function scenario(name: string, inputs: Readonly<Record<string, JsonValue>>): Scenario {
  return { name, trigger: 'call', payload: {}, inputs, now: START };
}

export function functionScenarios(ports: readonly InputPort[]): readonly Scenario[] {
  const choice = ports.find((port) => port.type.t === 'choice');
  const options = choice?.type.t === 'choice' ? choice.type.options : undefined;
  if (choice === undefined || options === undefined) {
    return [scenario('call', inputsFor(ports, undefined))];
  }
  return options.map((option) =>
    scenario(
      `call ${choice.name} ${option.id}`,
      inputsFor(ports, { name: choice.name, option: option.id }),
    ),
  );
}
