import type { TalkEngine } from './engine-state';
import { WebTalkEngine } from './web/web-engine';

export const talkEngine: TalkEngine = new WebTalkEngine();
