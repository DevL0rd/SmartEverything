import { admitLegacyImport } from './legacy-history';
import {
  ApiError,
  DEFAULT_AI_HARNESS_PERMISSION,
  type Engine,
  type DshEngine,
} from '@smarteverything/domain';
import type { HarnessService } from './service';

export class OwnEngineSelections {
  constructor(private readonly service: HarnessService) {}

  select(profileId: string, engine: Engine, _background = false, _clientId?: string): Engine {
    if (engine.kind !== 'openrouter') return engine;
    const selected = this.service.routes.resolve(profileId, engine.model, engine.effort);
    return {
      kind: 'dsh',
      execution_target: { kind: 'server' },
      session_id: null,
      model_route_id: selected.route_id,
      model: selected.model,
      effort: selected.effort,
      permission: DEFAULT_AI_HARNESS_PERMISSION,
    };
  }

  default(profileId: string, engine: DshEngine, _background: boolean): DshEngine {
    const known = this.service.routes
      .list(profileId)
      .some((route) => route.id === engine.model_route_id);
    const route = known ? engine.model_route_id : this.defaultRoute(profileId, engine);
    return {
      ...engine,
      model_route_id: route,
      session_id: null,
      execution_target: { kind: 'server' },
    };
  }

  private defaultRoute(profileId: string, engine: DshEngine): string {
    const route = this.service.store.profiles
      .list()
      .flatMap((profile) => this.service.routes.list(profile.id))
      .find((entry) => entry.id === engine.model_route_id);
    if (route?.auth.provider !== 'openrouter')
      throw new ApiError(
        'conflict',
        'The default model needs this profile’s explicit subscription supplier; there is no account or paid fallback.',
      );
    return this.service.routes.resolve(profileId, engine.model, engine.effort).route_id;
  }

  migrate(chatId: string, background: boolean, clientId?: string): DshEngine {
    return this.service.store.write(() => {
      const chat = this.service.store.aiChats.chat(chatId);
      if (chat.engine.kind === 'dsh') return chat.engine;
      if (chat.engine.kind !== 'openrouter')
        throw new ApiError('conflict', 'Native Claude and Codex retain their own engine boundary.');
      const engine = this.select(chat.profile_id, chat.engine, background, clientId);
      if (engine.kind !== 'dsh')
        throw new ApiError('conflict', 'Own chat selection did not resolve its native route.');
      admitLegacyImport(this.service, { ...chat, engine });
      this.service.store.aiChats.update(chat.id, { engine });
      return engine;
    });
  }
}
