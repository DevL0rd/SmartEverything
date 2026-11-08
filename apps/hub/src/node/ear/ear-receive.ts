import type { HubFrame } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { isEarsFrame, type EarHostPort, type EarsFrame } from './ear-host';

export function receiveEars(
  host: EarHostPort | null,
  frame: HubFrame,
  log: Logger,
): frame is EarsFrame {
  if (!isEarsFrame(frame)) {
    return false;
  }
  if (host === null) {
    log.warn('node.ears_unsupported', { type: frame.type });
  } else {
    host.receive(frame);
  }
  return true;
}
