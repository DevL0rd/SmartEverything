import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { background } from '@smarteverything/logging';
import { targetHistoryKey } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import type { Device } from '../../../store/state';
import { deviceModelOf } from '../../devices';
import {
  flipsOf,
  windowAt,
  withFlips,
  type LaneWindow,
  type PowerChange,
  type PowerFlip,
  type Window,
} from '../model/lanes';
import type { MemberPower } from '../use-target-state';
import { fetchPowerHistory } from './fetch-power-history';

const NO_WINDOW: LaneWindow = { from: 0, to: 0 };
const NO_FLIPS: readonly PowerFlip[] = [];
const NO_CHANGES: ReadonlyMap<string, readonly PowerChange[]> = new Map();
const NO_BEFORE: ReadonlyMap<string, boolean> = new Map();

export interface TargetHistory {
  readonly status: 'loading' | 'error' | 'ready';
  readonly changes: ReadonlyMap<string, readonly PowerChange[]>;
  readonly before: ReadonlyMap<string, boolean>;
  readonly window: LaneWindow;
  readonly refetch: () => void;
}

function powerKeys(members: readonly Device[]): ReadonlyMap<string, string> {
  const keys = new Map<string, string>();
  for (const member of members) {
    const key = deviceModelOf(member).power?.key;
    if (key !== undefined) keys.set(member.id, key);
  }
  return keys;
}

function statusOf(failed: boolean, waiting: boolean): TargetHistory['status'] {
  if (failed) return 'error';
  return waiting ? 'loading' : 'ready';
}

function useFlips(powers: Readonly<Record<string, MemberPower>>): readonly PowerFlip[] {
  const known = useRef<ReadonlyMap<string, boolean>>(new Map());
  const [flips, setFlips] = useState(NO_FLIPS);
  useEffect(() => {
    const step = flipsOf(known.current, powers, Date.now());
    known.current = step.known;
    if (step.flips.length > 0) setFlips((current) => [...current, ...step.flips]);
  }, [powers]);
  return flips;
}

export function useTargetHistory(
  members: readonly Device[],
  window: Window,
  powers: Readonly<Record<string, MemberPower>>,
): TargetHistory {
  const keys = useMemo(() => powerKeys(members), [members]);
  const ids = useMemo(() => [...keys.keys()], [keys]);
  const query = useScreenQuery({
    queryKey: targetHistoryKey(ids, window),
    queryFn: () => fetchPowerHistory(keys, window),
    enabled: ids.length > 0,
  });
  const { refetch: refetchQuery } = query;
  const refetch = useCallback((): void => {
    background(refetchQuery(), 'target_history.refetch_failed');
  }, [refetchQuery]);
  const flips = useFlips(powers);
  const loaded = query.data;
  const changes = useMemo(() => withFlips(loaded?.changes ?? NO_CHANGES, flips), [loaded, flips]);
  const status = statusOf(query.isError, loaded === undefined && ids.length > 0);
  const end = Math.max(loaded?.at ?? 0, flips.at(-1)?.at ?? 0);
  return {
    status,
    changes,
    before: loaded?.before ?? NO_BEFORE,
    window: loaded === undefined ? NO_WINDOW : { from: windowAt(window, loaded.at).from, to: end },
    refetch,
  };
}
