import { NODE_REGISTRY } from './all-kinds';
import type { NodeKind } from './define';

export interface NodeKindLookup {
  readonly get: (id: string) => NodeKind | undefined;
  readonly has: (id: string) => boolean;
}

export const STATIC_KIND_LOOKUP: NodeKindLookup = NODE_REGISTRY;

export function kindLookupFrom(find: (id: string) => NodeKind | undefined): NodeKindLookup {
  return { get: find, has: (id) => find(id) !== undefined };
}
