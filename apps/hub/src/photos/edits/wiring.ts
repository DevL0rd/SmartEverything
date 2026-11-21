import type { ConflictEnv } from '../../drive/conflicts';
import { systemDataSpace } from '../../drive/data-space';
import type { DriveReadService } from '../../drive/service-read';
import type { HubLayout } from '../../data-layout';
import type { OpenRouterPlatform } from '../../openrouter/platform';
import type { Store } from '../../store/store';
import type { PreviewDecoders } from '../pipeline/preview';
import { BUNDLED_COLOUR_WORKER, ColourRunner } from './colour-runner';
import type { EditDeps } from './deps';
import { OpenRouterEraser } from './eraser-openrouter';

export interface PhotoEditInputs {
  readonly store: Store;
  readonly env: ConflictEnv;
  readonly read: DriveReadService;
  readonly layout: HubLayout;
  readonly decoders: PreviewDecoders;
  readonly openRouter: Pick<OpenRouterPlatform, 'client'>;
  readonly eraserModel: () => Promise<string>;
}

export function photoEditDeps(inputs: PhotoEditInputs): EditDeps {
  const { store } = inputs;
  return {
    env: inputs.env,
    store,
    read: inputs.read,
    space: systemDataSpace.space,
    layout: inputs.layout,
    decoders: inputs.decoders,
    colour: new ColourRunner(BUNDLED_COLOUR_WORKER),
    eraser: new OpenRouterEraser(
      inputs.openRouter.client,
      (entry) => store.host.write('photoUsageRecord', entry),
      inputs.eraserModel,
    ),
  };
}
