import { automationTrace } from '../features/automations/data/trace-channel';
import { liveVoiceWatch } from './live-voice-watch';
import { liveWatch } from './live-watch';

export function attachWatches(send: Parameters<typeof liveWatch.attach>[0]): void {
  liveWatch.attach(send);
  liveVoiceWatch.attach(send);
  automationTrace.attach(send);
}

export function detachWatches(): void {
  liveWatch.detach();
  liveVoiceWatch.detach();
  automationTrace.detach();
}
