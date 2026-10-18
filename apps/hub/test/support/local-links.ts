import type { HubFrame } from '@smarteverything/domain';
import { Listeners } from '../../src/listeners';
import type { HubLink, NodeLink } from '../../src/node/link';

export function localLinks(): { readonly node: NodeLink; readonly hub: HubLink } {
  const up = new Listeners<unknown>();
  const down = new Listeners<HubFrame>();
  return {
    node: {
      send: (frame): void => {
        up.emit(frame);
      },
      onFrame: (listener) => down.listen(listener),
    },
    hub: {
      send: (frame): void => {
        down.emit(frame);
      },
      onFrame: (listener) => up.listen(listener),
    },
  };
}
