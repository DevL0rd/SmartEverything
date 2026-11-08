import { TitleService } from './titles/title-service';
import type { MemoryLearner } from '../memory/learner';
import { ReplySuggestions } from './suggestions/reply-suggestions';
import type { SideParts } from './side-completion';
import type { AssistantServiceOptions, TurnEnded } from './service-contract';
export function assistantAuxiliaries(
  options: AssistantServiceOptions,
  parts: SideParts,
  onFinished: (listener: TurnEnded) => () => void,
  learner: MemoryLearner,
): TitleService {
  const { store, now, log } = options;
  const titles = new TitleService({ ...parts, store, now, log });
  onFinished(titles.afterReply);
  onFinished(new ReplySuggestions({ ...parts, store, log }).afterReply);
  onFinished(learner.afterTurn);
  return titles;
}
