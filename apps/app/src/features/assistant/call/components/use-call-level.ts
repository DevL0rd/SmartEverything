import { useEffect } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import type { CallPhase } from '../call-state';
import type { CallLevelListener, LevelFeed } from '../engine/call-engine';
import { callEngine } from '../engine/engine';

type LevelSource = 'input' | 'output' | null;

function watchLevels(feed: LevelFeed, listener: CallLevelListener): () => void {
  if (feed.kind === 'events') {
    return feed.subscribe(listener);
  }
  let frame = 0;
  const read = (): void => {
    listener(feed.read());
    frame = requestAnimationFrame(read);
  };
  frame = requestAnimationFrame(read);
  return (): void => {
    cancelAnimationFrame(frame);
  };
}

export function useEngineLevel(source: LevelSource): SharedValue<number> {
  const level = useSharedValue(0);
  useEffect(() => {
    if (source === null) {
      level.set(0);
      return undefined;
    }
    const off = watchLevels(callEngine.levels, (levels) => {
      level.set(source === 'output' ? levels.out : levels.in);
    });
    return (): void => {
      off();
      level.set(0);
    };
  }, [source, level]);
  return level;
}

export function callLevelSource(phase: CallPhase, muted: boolean): LevelSource {
  if (phase === 'speaking') return 'output';
  if (phase === 'listening' && !muted) return 'input';
  return null;
}

export function useCallLevel(phase: CallPhase, muted: boolean): SharedValue<number> {
  return useEngineLevel(callLevelSource(phase, muted));
}
