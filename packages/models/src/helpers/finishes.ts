import type { ModelSpec, ModelSpecMaterial } from '@smarteverything/domain';

type Surface = Omit<ModelSpecMaterial, 'finish' | 'color'>;

type Override = NonNullable<ModelSpec['finishes']>[string][string];

export interface FinishSet {
  readonly finishes: NonNullable<ModelSpec['finishes']>;
  readonly defaultFinish: string;
}

export function colorMaterial(color: string, surface: Surface = {}): ModelSpecMaterial {
  return { color, ...surface };
}

export function tokenMaterial(finish: string, surface: Surface = {}): ModelSpecMaterial {
  return { finish, ...surface };
}

export function finishSet<Name extends string>(
  table: Readonly<Record<Name, Readonly<Record<string, Override>>>>,
  defaultFinish: NoInfer<Name>,
): FinishSet {
  return { finishes: table, defaultFinish };
}
