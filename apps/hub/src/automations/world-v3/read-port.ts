import type { ErrorClass, JsonValue } from '@smarteverything/domain';
import type { Checked } from '@smarteverything/flow/interpret/frames';
import type { KeptStart } from '@smarteverything/flow/interpret/kept-types';

export type ReadInputs = Readonly<Record<string, JsonValue>>;

type ReadOutputs = Readonly<Record<string, JsonValue>>;

export interface ReadScope {
  readonly automationId: string;
  readonly nodeId: string;
  readonly nodeKey: string;
  readonly seed: number;
  readonly activation: string;
  readonly memory?: JsonValue;
  readonly deviceTest?: (deviceId: string) => boolean;
  readonly kept?: (name: string) => KeptStart | undefined;
}

export interface ReadResult {
  readonly outputs: ReadOutputs;
  readonly memory?: JsonValue;
}

type ReadHandler = (inputs: ReadInputs, scope: ReadScope) => ReadResult;

export type ReadHandlers = Readonly<Record<string, ReadHandler>>;

export interface WorldReads {
  readonly read: (kind: string, inputs: ReadInputs, scope: ReadScope) => ReadResult;
}

export class ReadFailure extends Error {
  override readonly name = 'ReadFailure';

  constructor(
    readonly errorClass: ErrorClass,
    message: string,
    readonly detail?: Readonly<Record<string, JsonValue>>,
  ) {
    super(message);
  }
}

export function outputsOf(entries: Readonly<Record<string, JsonValue | undefined>>): ReadResult {
  const present = Object.entries(entries).flatMap(([name, value]) =>
    value === undefined ? [] : [[name, value] as const],
  );
  return { outputs: Object.fromEntries(present) };
}

export function keptOf(
  kept: (name: string) => Checked<KeptStart | undefined>,
): (name: string) => KeptStart | undefined {
  return (name) => {
    const found = kept(name);
    if (!found.ok) throw new ReadFailure(found.class, found.message);
    return found.value;
  };
}
