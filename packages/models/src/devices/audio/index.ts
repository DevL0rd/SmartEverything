import type { ModelSpec } from '@smarteverything/domain';
import { BOOKSHELF_SPEAKER_MODEL } from './bookshelf';
import { HEADPHONES_MODEL } from './headphones';
import { SOUNDBAR_MODEL } from './soundbar';
import { SUBWOOFER_MODEL } from './subwoofer';

export { BOOKSHELF_SPEAKER_MODEL, HEADPHONES_MODEL, SOUNDBAR_MODEL, SUBWOOFER_MODEL };

export const AUDIO_MODELS: readonly ModelSpec[] = [
  SOUNDBAR_MODEL,
  BOOKSHELF_SPEAKER_MODEL,
  SUBWOOFER_MODEL,
  HEADPHONES_MODEL,
];
