import type { AiChatRow, DshEngine } from '@smarteverything/domain';
import { modelUnavailable } from './model-unavailable';
import type { HarnessService } from './service';

export class OwnEngineSelections {
  constructor(private readonly service: HarnessService) {}

  private async routed(chat: AiChatRow, engine: DshEngine): Promise<DshEngine> {
    const known = this.service.routes
      .list(chat.profile_id)
      .some((route) => route.id === engine.model_route_id);
    if (known) return engine;
    const repaired = {
      ...engine,
      model_route_id: await this.defaultRoute(chat.profile_id, engine),
    };
    await this.service.store.host.call('aiChats', 'update', chat.id, { engine: repaired });
    return repaired;
  }

  private async defaultRoute(profileId: string, engine: DshEngine): Promise<string> {
    const route = (await this.service.store.host.call('profiles', 'list'))
      .flatMap((profile) => this.service.routes.list(profile.id))
      .find((entry) => entry.id === engine.model_route_id);
    if (route?.auth.provider !== 'openrouter')
      throw modelUnavailable(
        'This chat’s model route was removed and needs this profile’s explicit subscription supplier; there is no account or paid fallback.',
      );
    return this.service.routes.resolve(profileId, engine.model, engine.effort).route_id;
  }

  async migrate(chatId: string): Promise<void> {
    const chat = await this.service.store.host.call('aiChats', 'chat', chatId);
    if (chat.engine.kind === 'dsh') await this.routed(chat, chat.engine);
  }
}
