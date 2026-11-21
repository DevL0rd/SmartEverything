import {
  ApiError,
  AutomationValueError,
  NODE_REGISTRY,
  type AutomationValueContent,
  type AutomationValueOperation,
  type NodeKind,
  type NodeKindLookup,
} from '@smarteverything/domain';
import type { KindCatalog } from '../../automations/plugin-kinds/catalog';
import { storeUnit } from '../../store/host/unit';

export interface ValueUpdate {
  readonly valueId: string;
  readonly content: AutomationValueContent;
  readonly expectedRevision: number | undefined;
  readonly kinds: readonly NodeKind[];
}

export interface ValueRemoval {
  readonly valueId: string;
  readonly kinds: readonly NodeKind[];
}

export function contributedKinds(catalog: Pick<KindCatalog, 'kinds'>): NodeKind[] {
  return catalog
    .kinds()
    .filter((kind) => !NODE_REGISTRY.has(kind.id))
    .map(({ reads: _reads, ...kind }) => kind);
}

function lookupOf(contributed: readonly NodeKind[]): NodeKindLookup {
  const byId = new Map(contributed.map((kind) => [kind.id, kind] as const));
  return {
    get: (id) => NODE_REGISTRY.get(id) ?? byId.get(id),
    has: (id) => NODE_REGISTRY.has(id) || byId.has(id),
  };
}

export function valueWrite<T>(work: () => T): T {
  try {
    return work();
  } catch (cause) {
    if (cause instanceof AutomationValueError) throw new ApiError('invalid_request', cause.message);
    throw cause;
  }
}

export const AUTOMATION_VALUE_WRITE_UNITS = {
  automationValueCreate: storeUnit(
    (store, { content }: { readonly content: AutomationValueContent }) =>
      valueWrite(() => store.automationValues.create(content)),
  ),
  automationValueApply: storeUnit(
    (store, input: { readonly valueId: string; readonly operation: AutomationValueOperation }) =>
      valueWrite(() => store.automationValues.apply(input.valueId, input.operation)),
  ),
  automationValueUpdate: storeUnit((store, input: ValueUpdate) =>
    valueWrite(() =>
      store.automationValues.update(
        input.valueId,
        input.content,
        lookupOf(input.kinds),
        input.expectedRevision,
      ),
    ),
  ),
  automationValueRemove: storeUnit((store, input: ValueRemoval): null => {
    valueWrite(() => {
      store.automationValues.remove(input.valueId, lookupOf(input.kinds));
    });
    return null;
  }),
} as const;
