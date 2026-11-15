import {
  PHOTO_AI_MODELS,
  type PhotoAiModels,
  type PhotoAiModelsUpdate,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { PHOTO_AI_DEFAULT_MODELS, PHOTOS_AI_SETTINGS_KEY } from './defaults';

export class PhotoAiModelsUnreadableError extends Error {
  override readonly name = 'PhotoAiModelsUnreadableError';

  constructor(readonly reason: string) {
    super(`The stored Photos AI models cannot be read: ${reason}`);
  }
}

export class PhotoAiModelStore {
  constructor(private readonly store: Pick<Store, 'settingsKv'>) {}

  read(): PhotoAiModels {
    const stored = this.store.settingsKv.read(PHOTOS_AI_SETTINGS_KEY);
    if (stored === null) return PHOTO_AI_DEFAULT_MODELS;
    const parsed = PHOTO_AI_MODELS.safeParse(stored);
    if (!parsed.success) throw new PhotoAiModelsUnreadableError(parsed.error.message);
    return parsed.data;
  }

  update(change: PhotoAiModelsUpdate): PhotoAiModels {
    const next = PHOTO_AI_MODELS.parse({
      ...this.read(),
      ...Object.fromEntries(Object.entries(change).filter(([, value]) => value !== undefined)),
    });
    this.store.settingsKv.save(PHOTOS_AI_SETTINGS_KEY, next);
    return next;
  }
}
