import type { Outcome } from './turn';
import { act, chatMode, recognize, speak, type Reply, type Turn } from './replies';
import type { Speeches } from './speech-stream';

export interface TurnInfo {
  readonly index: number;
  readonly timeZone: string | null;
  readonly chat: boolean;
}

function quiet(turn: Turn, speeches: Speeches): Reply {
  return speak({ ...turn, text: '', url: speeches.pause().url });
}

type ChatSide = Extract<Outcome, { readonly kind: 'connect' | 'farewell' | 'quit' | 'pause' }>;

function chatSide(turn: Turn, outcome: ChatSide, chat: boolean, speeches: Speeches): Reply {
  switch (outcome.kind) {
    case 'connect':
    case 'farewell': {
      const answer = { text: outcome.answer.text, url: outcome.answer.stream.url };
      return chatMode(turn, outcome.kind === 'connect' ? 'connect' : 'quit', answer);
    }
    case 'quit':
      return chat ? chatMode(turn, 'quit') : quiet(turn, speeches);
    case 'pause':
      return quiet(turn, speeches);
  }
}

export function replyFor(
  outcome: Outcome,
  info: Pick<TurnInfo, 'index' | 'chat'>,
  speeches: Speeches,
): Reply {
  const turn = { index: info.index, queryText: outcome.heard ?? '' };
  switch (outcome.kind) {
    case 'speech':
      return speak({ ...turn, text: outcome.text, url: outcome.stream.url });
    case 'action':
      return act(turn, outcome.behavior, outcome.params);
    case 'look':
      return recognize(turn);
    case 'unheard':
      return act(turn, 'voice_dont_understand', {});
    case 'connect':
    case 'farewell':
    case 'quit':
    case 'pause':
      return chatSide(turn, outcome, info.chat, speeches);
  }
}
