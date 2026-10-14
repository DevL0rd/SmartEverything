import { ChatTitles } from './titles/chat-titles';
import { ReplySuggestions } from './suggestions/reply-suggestions';
import { engineAuxiliary } from './engine-auxiliary';
import type { EngineRegistry } from './engines/registry';
import type { AssistantServiceOptions, TurnEnded } from './service-contract';
export function assistantAuxiliaries(
  options: AssistantServiceOptions,
  engines: EngineRegistry,
  onFinished: (listener: TurnEnded) => () => void,
): ChatTitles {
  const { store, now, log } = options;
  const auxiliary = engineAuxiliary(engines, store);
  const titles = new ChatTitles({ store, now, log, auxiliary });
  onFinished(titles.afterReply);
  onFinished(new ReplySuggestions({ store, log, auxiliary }).afterReply);
  return titles;
}
