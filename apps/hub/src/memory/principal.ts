import type { Role } from '@smarteverything/domain';

export interface MemoryPrincipal {
  readonly profileId: string;
  readonly role: Role;
  readonly chatId: string | null;
  readonly messageId: string | null;
}
