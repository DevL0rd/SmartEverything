import { use, useEffect, useState } from 'react';
import { processKey, type ProcessesPart } from '@smarteverything/domain';
import { usePausable } from '../../../design/external-store';
import { ScreenPausedContext } from '../../../design/screen-pause';
import type { ChartPoint } from '../../../components/charts';
import { computerLive } from '../../../store/computer-live';
import { SeriesRing } from '../../../store/computer-rings';

export interface ProcessTrail {
  readonly cpu: readonly ChartPoint[];
  readonly memory: readonly ChartPoint[];
}

export function useProcessTrail(deviceId: string, key: string): ProcessTrail {
  const [rings] = useState(() => ({ cpu: new SeriesRing(), memory: new SeriesRing() }));
  const pause = use(ScreenPausedContext);
  useEffect(() => {
    const store = computerLive.store(deviceId);
    let seen: ProcessesPart | undefined;
    const feed = (): void => {
      const { at, parts } = store.get();
      if (parts.processes === seen) return;
      seen = parts.processes;
      const row = seen?.rows.find((candidate) => processKey(candidate) === key);
      if (at === null || row === undefined) return;
      const t = Date.parse(at);
      rings.cpu.push(t, row.cpu);
      rings.memory.push(t, row.memoryBytes);
    };
    feed();
    const off = store.subscribe(pause.gate(feed));
    return (): void => {
      off();
      pause.release(feed);
    };
  }, [deviceId, key, rings, pause]);
  return {
    cpu: usePausable(rings.cpu.subscribe, rings.cpu.points),
    memory: usePausable(rings.memory.subscribe, rings.memory.points),
  };
}
