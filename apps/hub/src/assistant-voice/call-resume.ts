import type { Logger } from '@smarteverything/logging';
import type { VoiceEndpoint } from './call-link';
import type { Call } from './call-parts';
import { background } from '@smarteverything/logging';

const RESUME_GRACE_MS = 20_000;

export function holdCall(call: Call, log: Logger): void {
  call.endpoint.detach();
  const timer = setTimeout(() => {
    background(
      call.conversation.end('disconnected', 'The connection to your home dropped.'),
      'conversation.end_failed',
    );
  }, RESUME_GRACE_MS);
  timer.unref();
  call.live.hold(timer);
  log.info('voice.call_detached', { callId: call.id });
}

export function adoptEndpoint(call: Call, endpoint: VoiceEndpoint): void {
  call.live.release();
  call.endpoint.attach(endpoint);
  call.link.restate();
  call.sight?.restate();
}
