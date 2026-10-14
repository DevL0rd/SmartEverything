import type { LiveStream } from '@smarteverything/domain';
import { appPlatform } from '../design/platform';

export function platformStreams(): readonly LiveStream[] {
  return appPlatform() === 'desktop'
    ? ['service_log', 'talk', 'assistant', 'claude']
    : ['talk', 'assistant', 'claude'];
}
