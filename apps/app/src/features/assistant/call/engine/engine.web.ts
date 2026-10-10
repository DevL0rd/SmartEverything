import type { CallEngine } from './call-engine';
import { WebCallEngine } from './web/web-call-engine';

export const callEngine: CallEngine = new WebCallEngine();
