import type { ChangeEnv } from '../../drive/changes';
import type { DriveReadService } from '../../drive/service-read';
import type { DriveWriteGuard } from '../../drive/quotas';
import type { HubLayout } from '../../data-layout';
import type { Store } from '../../store/store';
import type { ColourRunner } from './colour-runner';
import type { Eraser } from './eraser';
import type { PreviewDecoders } from '../pipeline/preview';

export type EditStore = Pick<
  Store,
  'driveRoots' | 'driveItems' | 'driveGrants' | 'driveVersions' | 'photoEdits' | 'context' | 'write'
>;

export interface EditDeps {
  readonly env: ChangeEnv;
  readonly store: EditStore;
  readonly read: Pick<DriveReadService, 'readItem'>;
  readonly guard: DriveWriteGuard;
  readonly layout: Pick<HubLayout, 'cache' | 'tmp'>;
  readonly decoders: PreviewDecoders;
  readonly colour: ColourRunner;
  readonly eraser: Eraser;
}
