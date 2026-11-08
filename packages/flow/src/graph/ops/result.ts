import type { NodeKindLookup, PortValue, ProgramV4 } from '@smarteverything/domain';
import type { PatchOp } from './schema';

export type RefusalCode =
  | 'unknown_key'
  | 'unknown_port'
  | 'bad_target'
  | 'bad_placement'
  | 'key_taken'
  | 'id_taken'
  | 'referenced'
  | 'not_allowed'
  | 'cannot_connect'
  | 'invalid_result';

export class PatchRefusal extends Error {
  constructor(
    readonly code: RefusalCode,
    readonly reason: string,
  ) {
    super(reason);
    this.name = 'PatchRefusal';
  }
}

export function refuse(code: RefusalCode, reason: string): never {
  throw new PatchRefusal(code, reason);
}

export interface Detachment {
  readonly owner: string;
  readonly where: 'port';
  readonly port: string;
  readonly value: PortValue;
  readonly reads: string;
}

export interface Created {
  readonly key: string;
  readonly id: string;
}

export interface OpEnv {
  readonly newId: () => string;
  readonly kinds: NodeKindLookup;
}

export interface Outcome {
  readonly program: ProgramV4;
  readonly inverse: readonly PatchOp[];
  readonly detached: readonly Detachment[];
  readonly created: readonly Created[];
}

export function outcome(
  program: ProgramV4,
  inverse: readonly PatchOp[],
  extra: { detached?: readonly Detachment[]; created?: readonly Created[] } = {},
): Outcome {
  return { program, inverse, detached: extra.detached ?? [], created: extra.created ?? [] };
}
