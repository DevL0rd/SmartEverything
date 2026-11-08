import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { useStableCallback } from '../../../design/use-stable-callback';
import { useLoaded } from '../../../store/selectors';
import { useEntityStore } from '../../../store/store-context';
import Baker from './baker';
import { bakeCache } from './bake-cache';
import { BakeChannel } from './bake-protocol';
import { createBakeQueue } from './bake-queue';
import { bakesInUse } from './bakes-in-use';

const log = new Logger('app.models');

export const bakeChannel = new BakeChannel();

export const modelBakeQueue = createBakeQueue({
  cache: bakeCache,
  bake: (request) => bakeChannel.bake(request),
});

const SLOT = bakeChannel.slot;

export const BAKE_HOST_PX = 280;

const OFF_VIEW = {
  position: 'absolute',
  top: 0,
  left: -2 * BAKE_HOST_PX,
  width: BAKE_HOST_PX,
  height: BAKE_HOST_PX,
} as const;

const FILL = { width: BAKE_HOST_PX, height: BAKE_HOST_PX } as const;

function ready(): Promise<void> {
  bakeChannel.ready();
  return Promise.resolve();
}

function result(text: string): Promise<void> {
  if (!bakeChannel.receive(text)) log.warn('model.bake_result_dropped', { bytes: text.length });
  return Promise.resolve();
}

function unavailable(detail: string): Promise<void> {
  log.warn('model.bake_webgl_missing', { detail });
  bakeChannel.fail(detail);
  return Promise.resolve();
}

function usePruneAtStart(): void {
  const store = useEntityStore();
  const loaded = useLoaded();
  useEffect(() => {
    if (loaded) modelBakeQueue.pruneOnce(() => bakesInUse(store.get()));
  }, [loaded, store]);
}

export function BakeHost(): ReactNode {
  usePruneAtStart();
  const [generation, setGeneration] = useState(0);
  const drop = useStableCallback((cause: string): void => {
    log.warn('model.bake_host_lost', { cause, generation });
    bakeChannel.lost();
    setGeneration((current) => current + 1);
  });
  const lost = useStableCallback((cause: string): Promise<void> => {
    drop(cause);
    return Promise.resolve();
  });
  return (
    <View
      style={OFF_VIEW}
      pointerEvents="none"
      collapsable={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Baker
        key={generation}
        ref={SLOT}
        onReady={ready}
        onResult={result}
        onLost={lost}
        onUnavailable={unavailable}
        dom={{
          style: FILL,
          onContentProcessDidTerminate: () => {
            drop('content_process_terminated');
          },
          onRenderProcessGone: () => {
            drop('render_process_gone');
          },
        }}
      />
    </View>
  );
}
