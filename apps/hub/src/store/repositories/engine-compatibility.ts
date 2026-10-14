import { ApiError, type Engine } from '@smarteverything/domain';

const UNAVAILABLE_COMPUTER_MODEL = 'smarteverything/unavailable-computer-engine';

export function assertEngineStorageCompatible(engine: Engine): void {
  if (engine.model === UNAVAILABLE_COMPUTER_MODEL)
    throw new ApiError(
      'conflict',
      'This unavailable compatibility marker cannot be stored or executed. Update the app to select a computer AI engine.',
    );
}
