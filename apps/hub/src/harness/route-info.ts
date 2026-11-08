import type { LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm';
import type { PermissionCatalog, PresetOption } from '@deepseek-ai/dsh-permission-presets';
import type {
  AiPermissionPresetOption,
  AiPermissionPresets,
  AiRouteInfo,
} from '@smarteverything/domain';

export interface RouteInfoRuntime {
  readonly model: (routeId: string, model: string) => Promise<LlmResolvedModelInfo>;
  readonly presets: () => {
    readonly catalog: PermissionCatalog;
    readonly custom: PresetOption;
  };
}

function optionOf(option: PresetOption): AiPermissionPresetOption {
  return { value: option.value, name: option.name, description: option.description ?? null };
}

export function presetsOf(source: ReturnType<RouteInfoRuntime['presets']>): AiPermissionPresets {
  const { catalog, custom } = source;
  return {
    options: catalog.options.map(optionOf),
    default_options: catalog.defaultOptions.map(optionOf),
    default_preset: catalog.defaultPreset,
    custom: optionOf(custom),
  };
}

export function routeInfoOf(
  routeId: string,
  resolved: LlmResolvedModelInfo,
  presets: AiPermissionPresets,
): AiRouteInfo {
  const { reasoning } = resolved;
  return {
    route_id: routeId,
    model: resolved.id,
    name: resolved.name,
    description: resolved.description ?? null,
    input_modalities: resolved.inputModalities === undefined ? null : [...resolved.inputModalities],
    context_window: resolved.context?.contextWindow ?? null,
    default_max_tokens: resolved.defaultMaxTokens ?? null,
    reasoning:
      reasoning === undefined
        ? null
        : {
            efforts: reasoning.efforts.map((effort) => ({
              id: effort.id,
              name: effort.name,
              description: effort.description ?? null,
            })),
            default_effort: reasoning.defaultEffort ?? null,
          },
    system_prompt_update: resolved.systemPromptUpdate ?? null,
    tool_update: resolved.toolUpdate ?? null,
    permission_presets: presets,
  };
}
