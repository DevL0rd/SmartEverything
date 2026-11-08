import type { ModelSpec } from '@smarteverything/domain';
import { ABSTRACT_SCULPTURE_MODEL } from './abstract-sculpture';
import { BOOK_STACK_MODEL } from './book-stack';
import { DECORATIVE_BOWL_MODEL } from './decorative-bowl';
import { GLOBE_MODEL } from './globe';
import { MAGAZINE_RACK_MODEL } from './magazine-rack';
import { PHOTO_FRAMES_MODEL } from './photo-frames';

export {
  ABSTRACT_SCULPTURE_MODEL,
  BOOK_STACK_MODEL,
  DECORATIVE_BOWL_MODEL,
  GLOBE_MODEL,
  MAGAZINE_RACK_MODEL,
  PHOTO_FRAMES_MODEL,
};

export const DECOR_OBJECT_MODELS: readonly ModelSpec[] = [
  ABSTRACT_SCULPTURE_MODEL,
  BOOK_STACK_MODEL,
  MAGAZINE_RACK_MODEL,
  GLOBE_MODEL,
  DECORATIVE_BOWL_MODEL,
  PHOTO_FRAMES_MODEL,
];
