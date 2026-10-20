import { SONICARE_ROUTINE_MODES, type SonicareMode } from '@smarteverything/domain';

const SEQUENTIAL_DEFAULT: readonly SonicareMode[] = [
  'clean',
  'white_plus',
  'gum_health',
  'deep_clean_plus',
  'tongue_care',
  'sensitive',
];

const SEQUENTIAL_BY_MODEL: readonly (readonly [string, readonly SonicareMode[]])[] = [
  ['HX960X', ['clean', 'gum_health', 'deep_clean_plus']],
  ['HX9120', ['clean', 'white_plus', 'deep_clean_plus']],
  ['HX961X', ['clean', 'white_plus', 'deep_clean_plus']],
  ['HX991X', ['clean', 'white_plus', 'gum_health', 'deep_clean_plus']],
];

export interface ModeInput {
  readonly selectsById: boolean;
  readonly routineId: number | null;
  readonly position: number | null;
  readonly routineIds: readonly number[] | null;
  readonly model: string | null;
}

export function modeOfId(id: number): SonicareMode | null {
  return SONICARE_ROUTINE_MODES[id] ?? null;
}

export function sequentialModes(model: string | null): readonly SonicareMode[] {
  const upper = (model ?? '').toUpperCase();
  return (
    SEQUENTIAL_BY_MODEL.find(([prefix]) => upper.startsWith(prefix))?.[1] ?? SEQUENTIAL_DEFAULT
  );
}

export function resolveMode(input: ModeInput): SonicareMode | null {
  if (input.selectsById) {
    return input.routineId === null ? null : modeOfId(input.routineId);
  }
  if (input.position === null) {
    return null;
  }
  if (input.routineIds !== null && input.routineIds.length > 0) {
    const id = input.routineIds[input.position];
    return id === undefined ? null : modeOfId(id);
  }
  return sequentialModes(input.model)[input.position] ?? null;
}

export function routineIdOf(mode: SonicareMode): number {
  return SONICARE_ROUTINE_MODES.indexOf(mode);
}
