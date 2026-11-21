import type { Store } from '../store/store';
import type { MemoryPrincipal } from './principal';

export interface Standing {
  readonly who: MemoryPrincipal;
  readonly chatId: string;
}

export class Principals {
  constructor(
    private readonly store: Pick<Store, 'host'>,
    private readonly owner: () => Promise<string>,
  ) {}

  async enabled(profileId: string | null): Promise<boolean> {
    const { host } = this.store;
    const id = profileId ?? (await this.owner());
    const role = (await host.call('personAccess', 'find', id))?.role;
    if (role === undefined || role === 'guest' || (profileId === null && role !== 'owner'))
      return false;
    return (await host.call('aiMemories', 'settings', id)).enabled;
  }

  async of(profileId: string | null): Promise<Standing | null> {
    const { host } = this.store;
    const id = profileId ?? (await this.owner());
    const role = (await host.call('personAccess', 'find', id))?.role;
    const chat = await host.call('aiChats', 'latest', id);
    if (role === undefined || role === 'guest' || chat === undefined) return null;
    return { who: { profileId: id, role, chatId: chat.id, messageId: null }, chatId: chat.id };
  }
}
