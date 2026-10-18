import { useEffect } from 'react';
import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { useScreenLive } from '../../../design/animation-gate';
import { ValueStore, useValue } from '../../../design/external-store';

const log = new Logger('app.listening');

interface LevelReading {
  readonly sourceKey: string;
  readonly dbfs: number;
}

export const levelStore = new ValueStore<LevelReading | null>(null);

export function receiveLevel(sourceKey: string, dbfs: number): void {
  const watched = levelStore.get();
  if (watched?.sourceKey !== sourceKey) return;
  const rounded = Math.round(dbfs);
  if (watched.dbfs !== rounded) levelStore.set({ sourceKey, dbfs: rounded });
}

const QUIET: LevelReading = { sourceKey: '', dbfs: -120 };

export function useLevelOf(sourceKey: string): number | null {
  const reading = useValue(levelStore);
  return reading !== null && reading.sourceKey === sourceKey ? reading.dbfs : null;
}

function watch(sourceKey: string | null): void {
  api()
    .call(E.watchListeningLevel, { body: { sourceKey } })
    .catch((error: unknown) => {
      log.warn('listening.level_watch_failed', { sourceKey, reason: String(error) });
    });
}

export function useLevelWatch(sourceKey: string, wanted: boolean): void {
  const { focused, foreground } = useScreenLive();
  const active = wanted && focused && foreground;
  useEffect(() => {
    if (!active) return undefined;
    levelStore.set({ ...QUIET, sourceKey });
    watch(sourceKey);
    return (): void => {
      levelStore.set(null);
      watch(null);
    };
  }, [active, sourceKey]);
}
