import type { PhotoAiModels } from '@smarteverything/domain';

export const PHOTO_AI_DEFAULT_MODELS: PhotoAiModels = {
  vision: 'google/gemini-3.1-flash-lite',
  embedding: 'qwen/qwen3-embedding-8b',
  petEmbedding: 'google/gemini-embedding-2',
  eraser: 'google/gemini-3.1-flash-lite-image',
};

export const EMBEDDING_DIMENSIONS = 512;

export const FACE_MODEL_ID = 'yunet-2023mar-sface-2021dec';

export const ESTIMATE_MICROS_PER_PHOTO = 800;

export const PHOTOS_AI_SETTINGS_KEY = 'photos_ai';

export const PHOTOS_AI_AREA = 'hub.photos-ai';
