import { NODE_REGISTRY, type NodeKind, type NodeKindLookup } from '@smarteverything/domain';
import type { KindAvailability } from '@smarteverything/flow/check/lint-types';
import type { Store } from '../store/store';
import { availabilityOf } from './plugin-kinds/versions';

export type UnitKinds = NodeKindLookup & {
  readonly availability: (id: string) => KindAvailability | undefined;
};

export function unitKinds(
  store: Pick<Store, 'pluginKinds'>,
  kinds: readonly NodeKind[],
): UnitKinds {
  const loaded = new Map(kinds.map((kind) => [kind.id, kind]));
  const placed = (id: string): NodeKind | undefined => NODE_REGISTRY.get(id) ?? loaded.get(id);
  const kept = (id: string): NodeKind | undefined => {
    const row = store.pluginKinds.find(id);
    return row === undefined || row.status === 'active' ? undefined : row.declaration;
  };
  const get = (id: string): NodeKind | undefined => placed(id) ?? kept(id);
  return {
    get,
    has: (id) => get(id) !== undefined,
    availability: (id): KindAvailability | undefined => {
      if (placed(id) !== undefined) return undefined;
      const row = store.pluginKinds.find(id);
      return row === undefined ? undefined : availabilityOf(row);
    },
  };
}
