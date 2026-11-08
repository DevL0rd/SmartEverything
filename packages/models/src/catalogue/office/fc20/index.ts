import type { ModelSpec } from '@smarteverything/domain';
import { BOOKCASE_MODEL } from './bookcase';
import { DESK_MAT_MODEL } from './desk-mat';
import { DESK_ORGANISER_MODEL } from './desk-organiser';
import { FILING_CABINET_MODEL } from './filing-cabinet';
import { PINBOARD_MODEL } from './pinboard';
import { WHITEBOARD_MODEL } from './whiteboard';

export {
  BOOKCASE_MODEL,
  DESK_MAT_MODEL,
  DESK_ORGANISER_MODEL,
  FILING_CABINET_MODEL,
  PINBOARD_MODEL,
  WHITEBOARD_MODEL,
};

export const OFFICE_STORAGE_MODELS: readonly ModelSpec[] = [
  FILING_CABINET_MODEL,
  BOOKCASE_MODEL,
  DESK_ORGANISER_MODEL,
  WHITEBOARD_MODEL,
  PINBOARD_MODEL,
  DESK_MAT_MODEL,
];
