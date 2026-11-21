import { NODE_REGISTRY, type NodeKind } from '@smarteverything/domain';
import type { KindCatalog } from './plugin-kinds/catalog';
import type { AutomationSecrets } from './secrets-v3';

export interface ProgramData {
  readonly kinds: readonly NodeKind[];
  readonly secrets: readonly string[];
}

export function pluginKindsOf(catalog: Pick<KindCatalog, 'kinds'>): readonly NodeKind[] {
  return catalog.kinds().filter((kind) => !NODE_REGISTRY.has(kind.id));
}

export function programData(
  catalog: Pick<KindCatalog, 'kinds'>,
  secrets: Pick<AutomationSecrets, 'list'>,
): ProgramData {
  return {
    kinds: pluginKindsOf(catalog),
    secrets: secrets.list().map((secret) => secret.id),
  };
}
