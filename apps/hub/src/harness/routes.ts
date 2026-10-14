import { createHash } from 'node:crypto';
import {
  ApiError,
  AI_MODEL_ROUTE,
  AI_MODEL_ROUTE_SELECTION,
  AI_MODEL_CHOICE,
  AI_EFFORT,
} from '@smarteverything/domain';
import type {
  AiModelRoute,
  AiModelRouteSelection,
  AiModelRow,
  AiHarnessTarget,
} from '@smarteverything/domain';
import type { Catalogue } from '../openrouter/catalogue';

export class HarnessRoutes {
  private readonly listeners = new Set<() => void>();
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }
  private changed(): void {
    for (const listener of this.listeners) listener();
  }
  private readonly supplierRoutes = new Map<string, AiModelRoute>();
  constructor(
    private readonly catalogue: Catalogue,
    private readonly configured: () => boolean,
  ) {}
  list(profileId: string): AiModelRoute[] {
    return [
      this.metered(profileId),
      ...[...this.supplierRoutes.values()].filter((route) => route.profile_id === profileId),
    ];
  }
  resolve(profileId: string, model: string | null, effort: string | null): AiModelRouteSelection {
    const resolved = this.catalogue.resolve(
      model === null ? null : AI_MODEL_CHOICE.parse(model),
      effort === null ? null : AI_EFFORT.parse(effort),
    );
    const row = this.catalogue.model(resolved.model_id);
    if (row.provider !== 'openrouter' || /^(?:anthropic|openai)\//.test(row.id))
      throw new ApiError(
        'conflict',
        'This model requires an explicit supported subscription supplier; paid Claude and OpenAI routes are unavailable.',
      );
    const route = this.metered(profileId);
    const selected = {
      route_id: route.id,
      capability_revision: route.capability_revision,
      model: resolved.model_id,
      effort: resolved.effort,
    };
    this.selected(profileId, selected, false);
    return selected;
  }
  publish(route: AiModelRoute): void {
    this.supplierRoutes.set(route.id, AI_MODEL_ROUTE.parse(route));
    this.changed();
  }
  offline(target: AiHarnessTarget): void {
    for (const [id, route] of this.supplierRoutes) {
      if (JSON.stringify(route.supplier) !== JSON.stringify(target)) continue;
      this.supplierRoutes.set(
        id,
        AI_MODEL_ROUTE.parse({
          ...route,
          state: 'unavailable',
          failure: {
            code: 'route_unavailable',
            message:
              'Subscription supplying host disconnected. Reconnect and refresh its account status.',
            retry_at: null,
          },
        }),
      );
    }
    this.changed();
  }
  selected(profileId: string, input: AiModelRouteSelection, background: boolean): AiModelRoute {
    const selection = AI_MODEL_ROUTE_SELECTION.parse(input);
    const route = this.list(profileId).find((entry) => entry.id === selection.route_id);
    if (route?.state !== 'ready')
      throw new ApiError(
        'conflict',
        'The selected supplying route is unavailable. Subscription routes have no paid fallback.',
      );
    if (route.capability_revision !== selection.capability_revision)
      throw new ApiError(
        'conflict',
        'Model capability revision changed; select the discovered route again.',
      );
    const model = route.models.find((entry) => entry.id === selection.model);
    if (
      model === undefined ||
      (selection.effort !== null && !model.capabilities.efforts.includes(selection.effort))
    )
      throw new ApiError(
        'invalid_request',
        'The selected model or effort was not discovered on this supplier.',
      );
    if (background && !route.background_authorized)
      throw new ApiError('forbidden', 'This route does not authorize background conversation use.');
    return route;
  }
  private metered(profileId: string): AiModelRoute {
    const rows = this.catalogue
      .rows('chat')
      .filter(
        (row) =>
          row.provider === 'openrouter' &&
          row.gone_at === null &&
          !/^(?:anthropic|openai)\//.test(row.id),
      );
    const revision = capabilityRevision(rows);
    const fields = {
      id: routeId(profileId),
      profile_id: profileId,
      supplier: { kind: 'server' } as const,
      subscriber_id: profileId,
      auth: { provider: 'openrouter', kind: 'hub-api-key' } as const,
      billing: 'metered' as const,
      fallback: 'none' as const,
      background_authorized: true,
      capability_revision: revision,
      models: rows.map((row) => model(row, revision)),
    };
    return AI_MODEL_ROUTE.parse(
      this.configured()
        ? { ...fields, state: 'ready' }
        : {
            ...fields,
            state: 'unavailable',
            failure: {
              code: 'route_unavailable',
              message: 'Configure the hub OpenRouter supplier before using metered models.',
              retry_at: null,
            },
          },
    );
  }
}
function routeId(profileId: string): string {
  const digest = createHash('sha256').update(`harness-openrouter:${profileId}`).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}
function model(row: AiModelRow, revision: string): AiModelRoute['models'][number] {
  return {
    id: row.id,
    name: row.name,
    capabilities: {
      revision,
      input_modalities: row.input_modalities.includes('image') ? ['text', 'image'] : ['text'],
      output_modalities: ['text'],
      reasoning: row.reasoning !== 'none',
      efforts: row.efforts,
      local_tools: row.tools,
      context_tokens: row.context_length === 0 ? null : row.context_length,
      max_output_tokens: row.max_output === 0 ? null : row.max_output,
      discovered_at: row.synced_at,
    },
  };
}

function capabilityRevision(rows: readonly AiModelRow[]): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          input_modalities: row.input_modalities,
          reasoning: row.reasoning,
          efforts: row.efforts,
          tools: row.tools,
          context_length: row.context_length,
          max_output: row.max_output,
        })),
      ),
    )
    .digest('hex');
}
