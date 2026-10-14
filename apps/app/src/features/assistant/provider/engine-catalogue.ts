import type {
  AiEngineCatalogue,
  AiRuntimeEngineCatalogue,
  AiRuntimeEnginePreference,
  Engine,
} from '@smarteverything/domain';

export type EngineComputer =
  | AiRuntimeEngineCatalogue['computers'][number]
  | (AiEngineCatalogue['computers'][number] & { readonly runtime: 'claude' });

export interface EngineCatalogue {
  readonly default: Engine | null;
  readonly computers: readonly EngineComputer[];
  readonly preferences: readonly AiRuntimeEnginePreference[];
}

export function engineCatalogue(
  value: AiEngineCatalogue | AiRuntimeEngineCatalogue,
): EngineCatalogue {
  return {
    default: value.default,
    computers: value.computers.map((computer) =>
      'runtime' in computer ? computer : { ...computer, runtime: 'claude' as const },
    ),
    preferences: value.preferences.map((preference) =>
      'runtime' in preference ? preference : { ...preference, runtime: 'claude' as const },
    ),
  };
}
