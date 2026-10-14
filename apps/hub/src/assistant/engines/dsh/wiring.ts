import type { HarnessDispatcher } from '@smarteverything/harness/process';
import type { HarnessService } from '../../../harness/service';
import type { ConversationLog } from '../../conversation-log';
import type { AssistantServiceOptions, TurnEnded } from '../../service-contract';
import type { ChatActivityNotice, ChatStreamNotice } from '@smarteverything/domain';
import type { Engine } from '../engine';
import { DshRunner } from './runner';

export function harnessEngine(
  deps: {
    readonly service: HarnessService;
    readonly dispatcher: HarnessDispatcher;
    readonly conversation: ConversationLog;
  },
  options: Pick<AssistantServiceOptions, 'emit'>,
  hooks: {
    readonly activity: (notice: ChatActivityNotice | ChatStreamNotice) => void;
    readonly finished: TurnEnded;
  },
): Engine {
  return new DshRunner({
    ...deps,
    emit: (notice, profileId): void => {
      options.emit(notice, profileId);
      hooks.activity(notice);
    },
    finished: hooks.finished,
  }).engine();
}
