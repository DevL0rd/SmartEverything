import type { Store } from '../store/store';

export function boardTypes(store: Store): string[] {
  const types = store.plugins
    .list()
    .filter((plugin) => plugin.enabled)
    .flatMap((plugin) => plugin.manifest.contributes.widgets.map((widget) => widget.id));
  return [...new Set(types)];
}
