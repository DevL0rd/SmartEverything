import type { Store } from '../store/store';
import type { MemoryPrincipal } from './principal';

export interface Standing {
  readonly who: MemoryPrincipal;
  readonly chatId: string;
}

export class Principals {
  constructor(
    private readonly store: Pick<Store, 'aiChats' | 'aiMemories' | 'personAccess'>,
    private readonly owner: () => string,
  ) {}

  enabled(profileId: string | null): boolean {
    const id = profileId ?? this.owner();
    const role = this.store.personAccess.find(id)?.role;
    if (role === undefined || role === 'guest' || (profileId === null && role !== 'owner'))
      return false;
    return this.store.aiMemories.settings(id).enabled;
  }

  of(profileId: string | null): Standing | null {
    const id = profileId ?? this.owner();
    const role = this.store.personAccess.find(id)?.role;
    const chat = this.store.aiChats.latest(id);
    if (role === undefined || role === 'guest' || chat === undefined) return null;
    return { who: { profileId: id, role, chatId: chat.id, messageId: null }, chatId: chat.id };
  }
}
