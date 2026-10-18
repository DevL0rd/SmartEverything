import { ChatTitles } from './titles/chat-titles';
import { ReplySuggestions } from './suggestions/reply-suggestions';
import type { SideParts } from './side-completion';
import type { AssistantServiceOptions, TurnEnded } from './service-contract';
export function assistantAuxiliaries(
  options: AssistantServiceOptions,
  parts: SideParts,
  onFinished: (listener: TurnEnded) => () => void,
): ChatTitles {
  const { store, now, log } = options;
  const titles = new ChatTitles({ ...parts, store, now, log });
  onFinished(titles.afterReply);
  onFinished(new ReplySuggestions({ ...parts, store, log }).afterReply);
  return titles;
}
