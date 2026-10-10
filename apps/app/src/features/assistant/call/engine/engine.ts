import type { CallEngine } from './call-engine';
import { NativeCallEngine } from './native/native-call-engine';

export const callEngine: CallEngine = new NativeCallEngine();
