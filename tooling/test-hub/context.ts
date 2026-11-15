import type { HubApi } from './api.ts';
import type { Anchor } from './clock.ts';
import type { ScratchPaths } from './guard.ts';
import type { Random } from './random.ts';

export interface PersonRef {
  readonly id: string;
  readonly name: string;
  readonly owner: boolean;
}

export interface FilesContext {
  readonly paths: ScratchPaths;
  readonly anchor: Anchor;
  readonly people: readonly PersonRef[];
  readonly rng: (label: string) => Random;
}

export interface SeedContext extends FilesContext {
  readonly api: HubApi;
  readonly deviceIds: ReadonlyMap<string, string>;
}

export type Counted = Readonly<Record<string, number>>;
