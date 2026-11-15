import { layoutForLocation, type HubLayout } from '../../apps/hub/src/data-layout/index.ts';
import type { ScratchPaths } from './guard.ts';

export function layoutOf(paths: ScratchPaths): HubLayout {
  return layoutForLocation({ root: paths.data, state: 'active' }, {});
}
