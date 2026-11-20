import { dirname, join } from 'node:path';
import {
  layoutForLocation,
  withDatabase,
  type HubLayout,
} from '../../apps/hub/src/data-layout/index.ts';
import type { ScratchPaths } from './guard.ts';

export function databaseFolderOf(paths: Pick<ScratchPaths, 'data'>): string {
  return join(dirname(paths.data), 'database');
}

export function layoutOf(paths: ScratchPaths): HubLayout {
  return withDatabase(
    layoutForLocation({ root: paths.data, state: 'active' }, {}),
    databaseFolderOf(paths),
  );
}
