import { layoutFromNames, V1_NAMES, type HubLayout, type LayoutEnvironment } from './layout';
import { LEGACY_NAMES } from './legacy';
import type { Location } from './pointer';

export function layoutForLocation(
  location: Pick<Location, 'root' | 'state'>,
  environment: LayoutEnvironment,
): HubLayout {
  const names = location.state === 'active' ? V1_NAMES : LEGACY_NAMES;
  return layoutFromNames(location.root, names, environment);
}
