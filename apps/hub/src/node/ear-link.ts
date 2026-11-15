import type { HubFrame } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { EarFactory, EarPort } from './ear/computer-ear';
import type { EarHostFactory, EarHostPort } from './ear/ear-host';
import type { NodeLink } from './link';

export type EarsFrame = Extract<
  HubFrame,
  { readonly type: 'ears_open' | 'ears_audio' | 'ears_close' | 'ears' | 'ears_score' }
>;

const EARS_FRAME_TYPES: ReadonlySet<string> = new Set([
  'ears_open',
  'ears_audio',
  'ears_close',
  'ears',
  'ears_score',
]);

export function isEarsFrame(frame: HubFrame): frame is EarsFrame {
  return EARS_FRAME_TYPES.has(frame.type);
}

interface EarOptions {
  readonly link: NodeLink;
  readonly ear?: EarFactory | undefined;
  readonly earHost?: EarHostFactory | undefined;
}

export function earOf(options: EarOptions): EarPort | null {
  return (
    options.ear?.((message) => {
      options.link.send({ type: 'ear', ear: message });
    }) ?? null
  );
}

export function earHostOf(options: EarOptions): EarHostPort | null {
  return (
    options.earHost?.(
      (key, ear) => {
        options.link.send({ type: 'ears', key, ear });
      },
      (id, heard) => {
        options.link.send({ type: 'ears_scored', id, heard });
      },
      (id, reason) => {
        options.link.send({ type: 'ears_score_failed', id, reason });
      },
    ) ?? null
  );
}

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
