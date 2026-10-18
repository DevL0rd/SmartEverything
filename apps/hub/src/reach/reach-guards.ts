import type { PluginOrigin, Role } from '@smarteverything/domain';

export interface Asker {
  readonly profileId: string;
  readonly role: Role;
  readonly clientId: string | null;
  readonly chatId: string | null;
  readonly origin?: PluginOrigin | null;
}
