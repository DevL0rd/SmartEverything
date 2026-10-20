import { z } from 'zod';
import { ORALB_MODE_LABELS, ORALB_PROFILE, type OralbMode } from './toothbrush-oralb';
import { SONICARE_MODE_LABELS, SONICARE_PROFILE, type SonicareMode } from './toothbrush-sonicare';

export * from './toothbrush-base';
export * from './toothbrush-link';
export * from './toothbrush-sonicare';
export * from './toothbrush-oralb';

export type BrushMode = SonicareMode | OralbMode;

export const BRUSH_MODES = [
  'clean',
  'white_plus',
  'gum_health',
  'tongue_care',
  'deep_clean_plus',
  'sensitive',
  'daily_clean',
  'gum_care',
  'whiten',
  'intense',
  'super_sensitive',
  'tongue_clean',
  'smart_adapt',
  'gentle_white',
] as const satisfies readonly BrushMode[];

export const BRUSH_MODE_LABELS: Readonly<Record<BrushMode, string>> = {
  ...SONICARE_MODE_LABELS,
  ...ORALB_MODE_LABELS,
};

export const BRUSH_PROFILE = z.discriminatedUnion('brand', [SONICARE_PROFILE, ORALB_PROFILE]);

export type BrushProfile = z.infer<typeof BRUSH_PROFILE>;
