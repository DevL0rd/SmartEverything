import { z } from 'zod';
import { COUNT, ID, NAME } from './shared';
import { PHOTO_LABEL } from './people';

export const PHOTO_ANALYSIS_STATES = ['done', 'failed', 'needs_key', 'skipped'] as const;

export type PhotoAnalysisState = (typeof PHOTO_ANALYSIS_STATES)[number];

export const PHOTO_AI_STAGES = ['faces', 'tags', 'index'] as const;

export type PhotoAiStage = (typeof PHOTO_AI_STAGES)[number];

const MODEL_ID = z.string().trim().min(1);

export const PHOTO_AI_STAGE_PROGRESS = z
  .strictObject({
    done: COUNT,
    queued: COUNT,
    failed: COUNT,
    needsKey: COUNT,
  })
  .readonly();

export type PhotoAiStageProgress = z.infer<typeof PHOTO_AI_STAGE_PROGRESS>;

export const PHOTO_AI_MODELS = z
  .strictObject({
    vision: MODEL_ID,
    embedding: MODEL_ID,
    petEmbedding: MODEL_ID,
    eraser: MODEL_ID,
  })
  .readonly();

export type PhotoAiModels = z.infer<typeof PHOTO_AI_MODELS>;

export const PHOTO_AI_MODEL_ROLES = ['vision', 'embedding', 'petEmbedding', 'eraser'] as const;

export type PhotoAiModelRole = (typeof PHOTO_AI_MODEL_ROLES)[number];

export const PHOTO_AI_MODEL_CHOICE = z
  .strictObject({
    id: MODEL_ID,
    name: NAME,
    author: NAME,
    contextLength: COUNT.nullable(),
    inputPerMtok: z.number().nonnegative().nullable(),
  })
  .readonly();

export type PhotoAiModelChoice = z.infer<typeof PHOTO_AI_MODEL_CHOICE>;

export const PHOTO_AI_MODEL_CATALOGUE = z
  .strictObject({
    vision: z.array(PHOTO_AI_MODEL_CHOICE).readonly(),
    embedding: z.array(PHOTO_AI_MODEL_CHOICE).readonly(),
    petEmbedding: z.array(PHOTO_AI_MODEL_CHOICE).readonly(),
    eraser: z.array(PHOTO_AI_MODEL_CHOICE).readonly(),
  })
  .readonly();

export type PhotoAiModelCatalogue = z.infer<typeof PHOTO_AI_MODEL_CATALOGUE>;

export const PHOTO_AI_SETTINGS = z
  .strictObject({ smartSearch: z.boolean().optional(), faceGrouping: z.boolean().optional() })
  .refine((settings) => Object.values(settings).some((value) => value !== undefined), {
    message: 'name at least one switch to change',
  });

export type PhotoAiSettings = z.infer<typeof PHOTO_AI_SETTINGS>;

export const PHOTO_AI_MODELS_UPDATE = z
  .strictObject({
    vision: MODEL_ID.optional(),
    embedding: MODEL_ID.optional(),
    petEmbedding: MODEL_ID.optional(),
    eraser: MODEL_ID.optional(),
  })
  .refine((models) => Object.values(models).some((value) => value !== undefined), {
    message: 'name at least one model to change',
  });

export type PhotoAiModelsUpdate = z.infer<typeof PHOTO_AI_MODELS_UPDATE>;

export const PHOTO_AI_PEOPLE = z.strictObject({ faces: COUNT, grouped: COUNT }).readonly();

export type PhotoAiPeople = z.infer<typeof PHOTO_AI_PEOPLE>;

export const PHOTO_FACE_DEVICE = z
  .strictObject({ state: z.enum(['starting', 'gpu', 'cpu', 'failed']), reason: z.string() })
  .readonly();

export type PhotoFaceDevice = z.infer<typeof PHOTO_FACE_DEVICE>;

export const PHOTO_AI_STATUS = z
  .strictObject({
    smartSearch: z.boolean(),
    faceGrouping: z.boolean(),
    hasKey: z.boolean(),
    total: COUNT,
    faces: PHOTO_AI_STAGE_PROGRESS,
    tags: PHOTO_AI_STAGE_PROGRESS,
    index: PHOTO_AI_STAGE_PROGRESS,
    people: PHOTO_AI_PEOPLE,
    spentMicros: COUNT,
    estimateMicros: COUNT,
    models: PHOTO_AI_MODELS,
    faceDevice: PHOTO_FACE_DEVICE,
  })
  .readonly();

export type PhotoAiStatus = z.infer<typeof PHOTO_AI_STATUS>;

export const PHOTO_AI_REANALYSE = z.strictObject({ estimateMicros: COUNT }).readonly();

export type PhotoAiReanalyse = z.infer<typeof PHOTO_AI_REANALYSE>;

export const PHOTO_AI_REANALYSED = z
  .strictObject({ queued: COUNT, estimateMicros: COUNT })
  .readonly();

export type PhotoAiReanalysed = z.infer<typeof PHOTO_AI_REANALYSED>;

export const PHOTO_ANALYSIS = z
  .strictObject({
    itemId: ID,
    state: z.enum(PHOTO_ANALYSIS_STATES),
    caption: NAME.nullable(),
    scene: NAME.nullable(),
    labels: z.array(PHOTO_LABEL).readonly(),
    text: z.string().nullable(),
  })
  .refine(
    (analysis) =>
      analysis.state === 'done' ||
      (analysis.caption === null &&
        analysis.scene === null &&
        analysis.labels.length === 0 &&
        analysis.text === null),
    { message: 'only a finished analysis carries results', path: ['state'] },
  )
  .readonly();

export type PhotoAnalysis = z.infer<typeof PHOTO_ANALYSIS>;

export const PHOTO_SUGGEST_QUERY = z.strictObject({ q: z.string().trim().min(1) });

export const PHOTO_SUGGESTED_GROUP = z
  .strictObject({
    groupId: ID,
    name: NAME,
    coverFaceId: ID,
    coverItemId: ID,
    count: COUNT.positive(),
  })
  .readonly();

export const PHOTO_SUGGESTED_THING = z
  .strictObject({ label: PHOTO_LABEL, count: COUNT.positive() })
  .readonly();

export const PHOTO_SUGGESTED_TEXT = z.strictObject({ itemId: ID, snippet: NAME }).readonly();

export const PHOTO_SUGGESTIONS = z
  .strictObject({
    people: z.array(PHOTO_SUGGESTED_GROUP).readonly(),
    pets: z.array(PHOTO_SUGGESTED_GROUP).readonly(),
    things: z.array(PHOTO_SUGGESTED_THING).readonly(),
    text: z.array(PHOTO_SUGGESTED_TEXT).readonly(),
  })
  .readonly();

export type PhotoSuggestions = z.infer<typeof PHOTO_SUGGESTIONS>;

export const PHOTOS_AI_NOTICE = z
  .strictObject({
    type: z.literal('photos_ai'),
    stage: z.enum(PHOTO_AI_STAGES),
    done: COUNT,
    total: COUNT,
  })
  .refine((progress) => progress.done <= progress.total, {
    message: 'done cannot pass total',
    path: ['done'],
  });

export type PhotosAiNotice = z.infer<typeof PHOTOS_AI_NOTICE>;

export const PHOTOS_PEOPLE_NOTICE = z.strictObject({
  type: z.literal('photos_people_changed'),
  profileId: ID,
});

export type PhotosPeopleNotice = z.infer<typeof PHOTOS_PEOPLE_NOTICE>;
