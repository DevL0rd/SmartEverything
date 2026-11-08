import { ApiError, type AiChatRow, type DshEngine } from '@smarteverything/domain';
import type { HarnessService } from './service';

export class OwnEngineSelections {
  constructor(private readonly service: HarnessService) {}

  private routed(chat: AiChatRow, engine: DshEngine): DshEngine {
    const known = this.service.routes
      .list(chat.profile_id)
      .some((route) => route.id === engine.model_route_id);
    if (known) return engine;
    const repaired = {
      ...engine,
      model_route_id: this.defaultRoute(chat.profile_id, engine),
    };
    this.service.store.aiChats.update(chat.id, { engine: repaired });
    return repaired;
  }

  private defaultRoute(profileId: string, engine: DshEngine): string {
    const route = this.service.store.profiles
      .list()
      .flatMap((profile) => this.service.routes.list(profile.id))
      .find((entry) => entry.id === engine.model_route_id);
    if (route?.auth.provider !== 'openrouter')
      throw new ApiError(
        'conflict',
        'This chat’s model route was removed and needs this profile’s explicit subscription supplier; there is no account or paid fallback.',
      );
    return this.service.routes.resolve(profileId, engine.model, engine.effort).route_id;
  }

  migrate(chatId: string): void {
    const chat = this.service.store.aiChats.chat(chatId);
    if (chat.engine.kind === 'dsh') this.routed(chat, chat.engine);
  }
}
