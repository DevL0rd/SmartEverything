import {
  assistantCallCan,
  assistantCallLevel,
  assistantCallOutputLevel,
} from '../../../../../../modules/health-connect';
import { callActive, callState } from '../../call-state';
import type { LevelFeed } from '../call-engine';

export const NATIVE_LEVELS: LevelFeed = {
  kind: 'poll',
  read: () =>
    callActive(callState.get())
      ? {
          in: assistantCallLevel(),
          out: assistantCallCan('assistantCallOutputLevel') ? assistantCallOutputLevel() : 0,
        }
      : { in: 0, out: 0 },
};
