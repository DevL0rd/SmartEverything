import { ApiError } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';

const log = new Logger('hub.speech');

export function logSpeechReadFailure(cause: unknown): void {
  log.debug('speech.reader_rejected', {
    expected: 'an available authorized speech reader',
    received: cause instanceof ApiError ? cause.code : typeof cause,
  });
}
