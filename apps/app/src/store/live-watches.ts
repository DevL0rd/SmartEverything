import type { LiveWireMessage } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { automationTrace } from '../features/automations/data/trace-channel';
import { liveVoiceWatch } from './live-voice-watch';
import { liveWatch } from './live-watch';

const log = new Logger('app.live');
const WATCH_MESSAGES: ReadonlySet<string> = new Set([
  'watch',
  'watch_automations',
  'voice_levels_watch',
]);

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

export function refusedWatch(message: LiveWireMessage): boolean {
  if (message.type !== 'refused') return false;
  const named = message.error.reason;
  if (named === 'watch') {
    liveWatch.refuseSent(message.error.message);
    return true;
  }
  if (named !== undefined && WATCH_MESSAGES.has(named)) {
    log.warn('live.watch_refused', { message: named, reason: message.error.message });
    return true;
  }
  return liveWatch.refuse(message.error.message);
}
