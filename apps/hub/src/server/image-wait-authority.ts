import type { ConversationAuthority } from '../harness/authority-contract';
import { effectiveTools } from '../assistant/coordination/grants';
import type { Store } from '../store/store';
import { ImageAdmissionError } from './image-admission';

const IMAGE_WAIT_TOOL = 'wait_for_images';

export function admitImageWait(
  store: Store,
  chatId: string,
  scopes: readonly ConversationAuthority[],
): void {
  if (store.settings.read().mcp_disabled_tools.includes(IMAGE_WAIT_TOOL))
    throw new ImageAdmissionError('tool_disabled', 'The image wait tool is disabled in this home.');
  const grants = [
    effectiveTools(store, store.aiChats.chat(chatId)),
    ...scopes.flatMap((authority) => [
      authority.tools,
      effectiveTools(
        store,
        store.aiChats.chat(store.assistantEvents.event(authority.event_id).chat_id),
      ),
    ]),
  ];
  if (grants.some((tools) => tools !== null && !tools.includes(IMAGE_WAIT_TOOL)))
    throw new ImageAdmissionError(
      'grant_required',
      'The current initiating or inherited chat/tool grant does not allow wait_for_images.',
    );
}
