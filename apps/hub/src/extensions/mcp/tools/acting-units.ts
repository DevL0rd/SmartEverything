import type { ClientRow, McpToolName, SettingsRow } from '@smarteverything/domain';
import { ownedAttachment } from '../../../assistant/chat-ownership';
import type { ChatOwner } from '../../../assistant/chat-directory';
import { effectiveClientById } from '../../../server/person-access-units';
import type { StoredAttachment } from '../../../store/repositories/assistant-chat';
import { storeUnit } from '../../../store/host/unit';

export type ActingProfile =
  | { readonly kind: 'person'; readonly personId: string }
  | { readonly kind: 'client'; readonly clientId: string | null };

export const MCP_ACTING_CLIENT_UNIT = storeUnit(
  (store, clientId: string | null): ClientRow | null =>
    clientId === null ? (store.clients.owner() ?? null) : effectiveClientById(store, clientId),
);

export const MCP_ACTING_PROFILE_UNIT = storeUnit((store, asked: ActingProfile): string => {
  if (asked.kind === 'person') return store.profiles.byId(asked.personId).id;
  return asked.clientId === null
    ? store.personAccess.homeOwner()
    : store.profiles.activeOf(asked.clientId).id;
});

export const SET_DISABLED_MCP_TOOLS_UNIT = storeUnit(
  (store, disabled: readonly McpToolName[]): SettingsRow =>
    store.settings.setDisabledMcpTools(disabled),
);

export const MCP_READABLE_ATTACHMENT_UNIT = storeUnit(
  (store, { owner, id }: { readonly owner: ChatOwner; readonly id: string }): StoredAttachment =>
    owner.role === 'owner' ? store.assistantChat.attachment(id) : ownedAttachment(store, owner, id),
);
